from __future__ import annotations

import io
import json
import logging
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import msgpack
import pandas as pd
import zstandard as zstd
from pydantic import BaseModel, Field, ValidationError, create_model
from PIL import Image, UnidentifiedImageError
from reedsolo import RSCodec

try:
    from ydata_profiling import ProfileReport
except ImportError:  # pragma: no cover - exercised when dependency missing
    ProfileReport = None


TABULAR_EXTENSIONS = {".csv", ".tsv", ".tab", ".json", ".jsonl", ".ndjson", ".parquet"}
TABULAR_MIME_TYPES = {
    "text/csv",
    "application/csv",
    "text/tab-separated-values",
    "application/json",
    "text/json",
    "application/x-ndjson",
    "application/jsonl",
    "application/x-parquet",
    "application/parquet",
}

try:
    from neuroglyph_quantum import QuantumPNGCodec
    from neuroglyph_neural import NeuralPNGCodec
except ImportError:
    QuantumPNGCodec = None
    NeuralPNGCodec = None

class DataPackage(BaseModel):
    raw_bytes: bytes = Field(..., description="Raw input data as bytes")
    name: str = Field(..., description="Name or identifier for the data")
    type: Optional[str] = Field(None, description="Type of data (e.g., 'image', 'model', 'metadata')")
    metadata: Optional[dict] = Field(default_factory=dict, description="Additional metadata")


def _normalize_image_to_png(raw: bytes, name: str) -> bytes:
    try:
        with Image.open(io.BytesIO(raw)) as img:
            with io.BytesIO() as output:
                img.save(output, format="PNG")
                return output.getvalue()
    except UnidentifiedImageError as exc:
        raise ValueError(f"File '{name}' is not a valid image or is corrupted.") from exc
    except Exception as exc:
        raise ValueError(f"Image normalization failed for '{name}': {exc}") from exc


def _extract_metadata(file_bytes: bytes, name: str) -> dict:
    meta = {"size": len(file_bytes), "name": name}
    mime, _ = mimetypes.guess_type(name)
    meta["mime_type"] = mime or "application/octet-stream"
    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            meta["image_width"], meta["image_height"] = img.size
            meta["image_mode"] = img.mode
    except Exception:
        pass
    return meta


def validate_and_clean(data: dict) -> DataPackage:
    try:
        file_input = data.get("file") or data.get("raw_bytes")
        name = data.get("name") or "unnamed"
        file_bytes = None
        try:
            import numpy as np
            is_numpy = isinstance(file_input, np.ndarray)
        except ImportError:
            is_numpy = False
        if is_numpy:
            try:
                if file_input.ndim in (2, 3):
                    img = Image.fromarray(file_input)
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    file_bytes = buf.getvalue()
                else:
                    buf = io.BytesIO()
                    np.save(buf, file_input)
                    file_bytes = buf.getvalue()
            except Exception:
                file_bytes = file_input.tobytes()
        elif isinstance(file_input, (str, Path)):
            file_path = Path(file_input)
            if not file_path.exists():
                raise ValueError(f"File path '{file_input}' does not exist.")
            file_bytes = file_path.read_bytes()
            name = name or file_path.name
        elif isinstance(file_input, bytes):
            file_bytes = file_input
        else:
            raise ValueError(
                "Input must include 'file' or 'raw_bytes' as bytes, str, Path, or NumPy array."
            )

        is_image = False
        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                is_image = True
        except Exception:
            pass

        if is_image:
            file_bytes = _normalize_image_to_png(file_bytes, name)
            file_type = "image/png"
        else:
            file_type = data.get("type") or "binary"

        meta = _extract_metadata(file_bytes, name)
        meta.update(data.get("metadata", {}))

        package = DataPackage(
            raw_bytes=file_bytes,
            name=name,
            type=file_type,
            metadata=meta,
        )
        return package
    except ValidationError as exc:
        raise ValueError(f"Data validation failed: {exc}") from exc
    except Exception as exc:
        raise ValueError(f"Data preparation error: {exc}") from exc


def _normalize_option(value: Any) -> str | bool | None:
    if isinstance(value, str):
        return value.strip().lower()
    return value


def select_ingestion_mode(package: DataPackage, options: dict[str, Any] | None = None) -> str:
    options = options or {}
    raw_value = options.get("neuroShatter", options.get("neuro_shatter"))
    normalized = _normalize_option(raw_value)

    if normalized in ("legacy", "off", "disabled", False, "false"):
        return "legacy"
    if normalized in ("neuro", "force", "enabled", True, "true", "on"):
        return "neuro"
    return "neuro" if is_tabular_package(package) else "legacy"


def is_tabular_package(package: DataPackage) -> bool:
    name = (package.name or "").lower()
    ext = Path(name).suffix
    mime_type = (package.metadata or {}).get("mime_type") or package.type or ""
    return ext in TABULAR_EXTENSIONS or mime_type.lower() in TABULAR_MIME_TYPES


def _select_codec(data_bytes: bytes, meta: dict) -> tuple[Any, str]:
    if QuantumPNGCodec:
        return QuantumPNGCodec(), "QuantumPNG"
    if NeuralPNGCodec:
        return NeuralPNGCodec(), "NeuralPNG"
    raise ImportError("No Neuroglyph codecs available. Please install neuroglyph_quantum or neuroglyph_neural.")


def serialize_and_patternize(package: DataPackage) -> dict[str, Any]:
    if not (QuantumPNGCodec or NeuralPNGCodec):
        raise ImportError("Neuroglyph advanced codecs are not installed. Please install neuroglyph_quantum or neuroglyph_neural.")
    try:
        original_data = package.dict() if hasattr(package, "dict") else package
        codec, codec_name = _select_codec(original_data, package.metadata)
        try:
            if codec_name == "QuantumPNG" and hasattr(codec, "compress_adaptive"):
                compressed, metrics = codec.compress_adaptive(original_data)
            elif hasattr(codec, "compress"):
                compressed, metrics = codec.compress(original_data)
            else:
                raise RuntimeError("No suitable compress method found in Neuroglyph codec.")
        except (TypeError, AttributeError, ValueError):
            try:
                import numpy as np
                buffer_payload = np.frombuffer(package.raw_bytes, dtype=np.uint8)
            except Exception:
                buffer_payload = package.raw_bytes
            if codec_name == "QuantumPNG" and NeuralPNGCodec:
                codec = NeuralPNGCodec()
                compressed, metrics = codec.compress(buffer_payload)
                codec_name = "NeuralPNG"
            elif hasattr(codec, "compress"):
                compressed, metrics = codec.compress(buffer_payload)
            else:
                raise
    except Exception as exc:
        logging.warning("Neuroglyph codecs failed; falling back to raw payload.")
        compressed = package.raw_bytes
        codec_name = "raw"
        metrics = {"original_size": len(package.raw_bytes), "compressed_size": len(package.raw_bytes), "compression": 1.0}
    if not metrics or not isinstance(metrics, dict):
        metrics = {}
    if "original_size" not in metrics:
        if isinstance(original_data, (bytes, bytearray)):
            metrics["original_size"] = len(original_data)
        elif hasattr(original_data, "nbytes"):
            metrics["original_size"] = original_data.nbytes
        elif hasattr(package, "raw_bytes"):
            metrics["original_size"] = len(package.raw_bytes)
        else:
            metrics["original_size"] = None
    if "compressed_size" not in metrics:
        metrics["compressed_size"] = len(compressed) if isinstance(compressed, (bytes, bytearray)) else None
    if "compression" not in metrics:
        try:
            metrics["compression"] = metrics["original_size"] / max(1, metrics["compressed_size"])
        except Exception:
            metrics["compression"] = 1.0
    return {
        "patternized_blob": compressed,
        "name": package.name,
        "type": package.type,
        "metadata": package.metadata,
        "codec": codec_name,
        "metrics": metrics,
    }


def hyper_compress(patternized_blob: bytes, zstd_dict: bytes | None = None, level: int = 22) -> dict[str, Any]:
    try:
        if zstd_dict:
            zdict = zstd.ZstdCompressionDict(zstd_dict)
            compressor = zstd.ZstdCompressor(level=level, dict_data=zdict)
        else:
            compressor = zstd.ZstdCompressor(level=level)
        compressed_blob = compressor.compress(patternized_blob)
        ratio = len(patternized_blob) / len(compressed_blob) if len(compressed_blob) > 0 else 1.0

        frame_params = None
        frame_size = None
        try:
            frame_params = zstd.get_frame_parameters(compressed_blob)
            frame_size = zstd.frame_content_size(compressed_blob)
        except Exception:
            pass

        return {
            "compressed_blob": compressed_blob,
            "compression_ratio": ratio,
            "frame_parameters": frame_params,
            "frame_content_size": frame_size,
            "zstd_level": level,
            "zstd_dict_used": bool(zstd_dict),
        }
    except Exception as exc:
        logging.exception("Zstandard compression failed")
        raise RuntimeError(f"Zstandard compression failed: {exc}") from exc


def _read_dataframe_from_bytes(file_bytes: bytes, name: str, mime_type: str | None) -> pd.DataFrame:
    ext = Path(name).suffix.lower()
    mime = (mime_type or "").lower()

    def read_csv(separator: str = ",") -> pd.DataFrame:
        return pd.read_csv(io.BytesIO(file_bytes), sep=separator)

    if ext == ".csv" or mime in {"text/csv", "application/csv"}:
        return read_csv()
    if ext in {".tsv", ".tab"} or mime == "text/tab-separated-values":
        return read_csv(separator="\t")
    if ext in {".json", ".jsonl", ".ndjson"} or mime in {
        "application/json",
        "text/json",
        "application/x-ndjson",
        "application/jsonl",
    }:
        try:
            return pd.read_json(io.BytesIO(file_bytes), lines=True)
        except ValueError:
            return pd.read_json(io.BytesIO(file_bytes))
    if ext == ".parquet" or mime in {"application/x-parquet", "application/parquet"}:
        return pd.read_parquet(io.BytesIO(file_bytes))

    try:
        return read_csv()
    except Exception:
        try:
            return pd.read_json(io.BytesIO(file_bytes))
        except Exception as exc:
            raise ValueError("Unsupported tabular payload; expected CSV, JSON, or Parquet.") from exc


class NeuroShatterEngine:
    """
    Stage 1: ydata-profiling (Deep Diagnostic)
    Stage 2: Pydantic (Precision Cleaner)
    Stage 3: Neuro-Shatter (Pattern Extraction - Constants/Gradients)
    Stage 4: JZPack (Zstd + MessagePack Delivery)
    """

    def __init__(self) -> None:
        self.patterns: dict[str, dict[str, Any]] = {}
        self.model = None

    def profile_and_build_model(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Stage 1: ydata-profiling Diagnostic."""
        if ProfileReport is None:
            raise RuntimeError(
                "ydata-profiling is required for Neuro-Shatter. Install ydata-profiling to continue."
            )
        profile = ProfileReport(df, minimal=True, progress_bar=False)

        report_dict = json.loads(profile.to_json())

        fields: dict[str, Any] = {}
        type_map = {
            "numeric": float,
            "integer": int,
            "categorical": str,
            "datetime": datetime,
            "boolean": bool,
        }
        for col_name, stats in report_dict.get("variables", {}).items():
            dtype = str(stats.get("type", "")).lower()
            fields[col_name] = (Optional[type_map.get(dtype, str)], Field(None))

        self.model = create_model("GoldenRecord", **fields)
        return report_dict

    def shatter_patterns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Stage 2: Pattern Extraction (The 1000x Logic)."""
        residuals = df.copy()
        for col in df.columns:
            if df[col].nunique(dropna=False) == 1:
                self.patterns[col] = {"type": "constant", "value": str(df[col].iloc[0])}
                residuals = residuals.drop(columns=[col])
                continue

            if pd.api.types.is_numeric_dtype(df[col]):
                diffs = df[col].diff().dropna()
                if not diffs.empty and diffs.nunique() == 1:
                    self.patterns[col] = {
                        "type": "gradient",
                        "start": float(df[col].iloc[0]),
                        "step": float(diffs.iloc[0]),
                        "len": len(df),
                    }
                    residuals = residuals.drop(columns=[col])
        return residuals

    def clean_with_precision(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Stage 3: Pydantic Precision Cleaning."""
        if self.model is None:
            raise RuntimeError("Precision model was not built before cleaning.")
        cleaned_records: list[dict[str, Any]] = []
        raw_data = df.to_dict(orient="records")
        for record in raw_data:
            try:
                clean_obj = self.model(**record)
                cleaned_records.append(clean_obj.model_dump())
            except Exception:
                continue
        return cleaned_records

    def jzpack_finalize(self, data: Any, report: Dict[str, Any]) -> bytes:
        """Stage 4: JZPack (Zstd + MessagePack)."""
        payload_bytes = msgpack.packb(data, use_bin_type=True)
        rs_parity_ratio = 0.5
        rs_block_size = len(payload_bytes)
        rs_parity_bytes = int(rs_block_size * rs_parity_ratio) if rs_block_size else 0
        if rs_parity_bytes:
            payload_bytes = RSCodec(rs_parity_bytes).encode(payload_bytes)
        optimal_package = {
            "metadata": {
                "engine_v": "2025.NeuroShatter",
                "patterns": self.patterns,
                "schema_report": report,
                "rs_parity_ratio": rs_parity_ratio,
                "rs_block_size": rs_block_size,
            },
            "payload": payload_bytes,
        }
        packed = msgpack.packb(optimal_package, use_bin_type=True)
        cctx = zstd.ZstdCompressor(level=3)
        return cctx.compress(packed)


def run_neuro_shatter(package: DataPackage) -> dict[str, Any]:
    """Run the Neuro-Shatter pipeline and return compressed payload + diagnostics."""
    if ProfileReport is None:
        raise RuntimeError(
            "Neuro-Shatter requires ydata-profiling. Install ydata-profiling to enable this feature."
        )
    try:
        df = _read_dataframe_from_bytes(
            package.raw_bytes,
            package.name,
            (package.metadata or {}).get("mime_type") or package.type,
        )
    except Exception as exc:
        logging.exception("Neuro-Shatter failed to parse tabular data")
        raise RuntimeError(f"Neuro-Shatter failed to parse tabular data: {exc}") from exc

    engine = NeuroShatterEngine()
    report = engine.profile_and_build_model(df)
    residual_data = engine.shatter_patterns(df)
    clean_payload = engine.clean_with_precision(residual_data)
    compressed_blob = engine.jzpack_finalize(clean_payload, report)

    compression_ratio = (
        len(package.raw_bytes) / len(compressed_blob)
        if compressed_blob
        else 1.0
    )

    return {
        "compressed_blob": compressed_blob,
        "compression_ratio": compression_ratio,
        "neuro_shatter_report": report,
        "neuro_shatter_patterns": engine.patterns,
        "neuro_shatter_records": len(clean_payload),
    }


def run_ingestion_convert(package: DataPackage, options: dict[str, Any] | None = None) -> dict[str, Any]:
    mode = select_ingestion_mode(package, options)
    if mode == "neuro":
        return run_neuro_shatter(package)
    return serialize_and_patternize(package)
