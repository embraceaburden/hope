from __future__ import annotations

import io
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import msgpack
import pandas as pd
import zstandard as zstd
from pydantic import Field, create_model

try:
    from ydata_profiling import ProfileReport
except ImportError:  # pragma: no cover - exercised when dependency missing
    ProfileReport = None

from preparation import DataPackage


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


def _normalize_option(value: Any) -> str | bool | None:
    if isinstance(value, str):
        return value.strip().lower()
    return value


def should_use_neuro_shatter(package: DataPackage, options: dict[str, Any] | None = None) -> bool:
    options = options or {}
    raw_value = options.get("neuroShatter", options.get("neuro_shatter"))
    normalized = _normalize_option(raw_value)

    if normalized in (False, "false", "off", "disabled"):
        return False
    if normalized in (True, "true", "on", "enabled"):
        return True

    return is_tabular_package(package)


def is_tabular_package(package: DataPackage) -> bool:
    name = (package.name or "").lower()
    ext = Path(name).suffix
    mime_type = (package.metadata or {}).get("mime_type") or package.type or ""
    return ext in TABULAR_EXTENSIONS or mime_type.lower() in TABULAR_MIME_TYPES


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
        optimal_package = {
            "metadata": {
                "engine_v": "2025.NeuroShatter",
                "patterns": self.patterns,
                "schema_report": report,
            },
            "payload": data,
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
