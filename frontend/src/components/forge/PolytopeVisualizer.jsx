import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';

const POLYTOPE_CONFIGS = {
  cube: {
    vertices: [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ],
    color: '#bc804d'
  },
  grand_antiprism: {
    vertices: [
      [0, 0, 2], [1.8, 0, 0.5], [0.5, 1.7, 0.5], [-1.5, 1.2, 0.5], [-1.5, -1.2, 0.5],
      [0.5, -1.7, 0.5], [1.2, 0.8, -1], [1.2, -0.8, -1], [-0.8, 1.5, -1], [-1.8, 0, -1],
      [-0.8, -1.5, -1], [0, 0, -2]
    ],
    edges: [
      [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
      [1, 2], [2, 3], [3, 4], [4, 5], [5, 1],
      [1, 6], [2, 6], [2, 8], [3, 8], [3, 9],
      [4, 9], [4, 10], [5, 10], [5, 7], [1, 7],
      [6, 7], [7, 11], [6, 11], [8, 11], [9, 11], [10, 11],
      [6, 8], [8, 9], [9, 10], [10, 7]
    ],
    color: '#9d442a'
  },
  regular_polygon: {
    vertices: Array.from({ length: 12 }, (_, i) => {
      const angle = (i * 2 * Math.PI) / 12;
      const z = Math.sin(i * 0.5) * 1.5;
      return [Math.cos(angle) * 2, Math.sin(angle) * 2, z];
    }),
    edges: Array.from({ length: 12 }, (_, i) => [i, (i + 1) % 12]),
    color: '#0c414c'
  }
};

export default function PolytopeVisualizer({
  polytopeType = 'cube',
  permutationKey = null,
  isActive = false,
  geometricTelemetry = null
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const animationRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const telemetryPolytopeType = geometricTelemetry?.polytopeType || polytopeType;
  const telemetryVector = geometricTelemetry?.f_vector || null;

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xecebea);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0xbc804d, 1, 100);
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x9d442a, 0.8, 100);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);

    // Create polytope
    const config = POLYTOPE_CONFIGS[telemetryPolytopeType] || POLYTOPE_CONFIGS.cube;
    const polytopeGroup = new THREE.Group();

    // Vertices (spheres)
    const vertexGeometry = new THREE.SphereGeometry(0.08, 16, 16);
    const vertexMaterial = new THREE.MeshPhongMaterial({ 
      color: config.color,
      emissive: config.color,
      emissiveIntensity: 0.2,
      shininess: 100
    });

    config.vertices.forEach(([x, y, z]) => {
      const sphere = new THREE.Mesh(vertexGeometry, vertexMaterial);
      sphere.position.set(x, y, z);
      polytopeGroup.add(sphere);
    });

    // Edges (lines)
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: config.color,
      linewidth: 2,
      opacity: 0.7,
      transparent: true
    });

    config.edges.forEach(([i, j]) => {
      const points = [
        new THREE.Vector3(...config.vertices[i]),
        new THREE.Vector3(...config.vertices[j])
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, lineMaterial);
      polytopeGroup.add(line);
    });

    // Glowing core
    const coreGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({ 
      color: config.color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    polytopeGroup.add(core);

    // Outer glow
    const glowGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({ 
      color: config.color,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    polytopeGroup.add(glow);

    scene.add(polytopeGroup);

    // Animation
    let rotationSpeed = isActive ? 0.02 : 0.005;
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      // Rotate the polytope
      polytopeGroup.rotation.x += rotationSpeed * 0.7;
      polytopeGroup.rotation.y += rotationSpeed;
      polytopeGroup.rotation.z += rotationSpeed * 0.3;

      // Pulse the core when active
      if (isActive) {
        const scale = 1 + Math.sin(Date.now() * 0.003) * 0.15;
        core.scale.set(scale, scale, scale);
        glow.scale.set(scale * 1.5, scale * 1.5, scale * 1.5);
      }

      renderer.render(scene, camera);
    };

    animate();
    setIsLoading(false);

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [telemetryPolytopeType, isActive]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <Card className={`glass-panel overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
      <CardHeader className="border-b border-[var(--color-gold)]/20 heritage-gradient-subtle">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-[var(--color-pine-teal)] flex items-center gap-2">
              Geometric Key Visualization
              {isActive && (
                <span className="flex items-center gap-1 text-xs font-normal text-[var(--color-gold)]">
                  <div className="h-2 w-2 rounded-full bg-[var(--color-gold)] animate-pulse" />
                  Active
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-[var(--color-gold)]/20 text-[var(--color-pine-teal)]">
                {telemetryPolytopeType.replace('_', ' ')}
              </Badge>
              {permutationKey && (
                <Badge variant="outline" className="text-xs font-mono">
                  Key: {permutationKey.slice(0, 8)}...
                </Badge>
              )}
            </div>
          </div>
          <button
            onClick={toggleFullscreen}
            className="h-8 w-8 rounded-lg hover:bg-[var(--color-gold)]/20 flex items-center justify-center transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 text-[var(--color-pine-teal)]" />
            ) : (
              <Maximize2 className="h-4 w-4 text-[var(--color-pine-teal)]" />
            )}
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        <div 
          ref={mountRef} 
          className={`bg-gradient-to-br from-[var(--color-satin)] to-white ${
            isFullscreen ? 'h-[calc(100vh-12rem)]' : 'h-[400px]'
          }`}
        />
        
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-satin)]/80">
            <Loader2 className="h-8 w-8 text-[var(--color-gold)] animate-spin" />
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 p-3 rounded-lg glass-panel text-xs text-[var(--color-pine-teal)]">
          <p className="font-semibold mb-1">Scrambling Pattern</p>
          <p className="text-gray-600">
            This {telemetryPolytopeType.replace('_', ' ')} generates unique permutation sequences for data scrambling. 
            Each vertex represents a transformation point in the encoding space.
          </p>
          {telemetryVector && (
            <p className="text-gray-500 mt-1 font-mono">
              f-vector: {Array.isArray(telemetryVector) ? telemetryVector.join(', ') : telemetryVector}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
