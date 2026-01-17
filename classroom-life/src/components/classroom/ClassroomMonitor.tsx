import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { LearningContent } from './mockData';

interface ClassroomMonitorProps {
  position: [number, number, number];
  content: LearningContent;
  onClick?: () => void;
  isFocused?: boolean;
}

export function ClassroomMonitor({ position, content, onClick, isFocused }: ClassroomMonitorProps) {
  const screenRef = useRef<THREE.Mesh>(null);
  const [flickerIntensity, setFlickerIntensity] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  
  // CRT flicker effect
  useFrame((state) => {
    const flicker = 0.95 + Math.sin(state.clock.elapsedTime * 60) * 0.03 + Math.random() * 0.02;
    setFlickerIntensity(flicker);
  });
  
  const crtColor = "#3d3d3d";
  const screenGlow = isHovered && !isFocused ? "#2a6a2a" : "#1a4a1a";
  
  return (
    <group 
      position={position} 
      rotation={[0, Math.PI / 2, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {/* CRT Monitor body - chunky retro style */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 1.4, 0.8]} />
        <meshLambertMaterial color={crtColor} />
      </mesh>
      
      {/* Monitor bezel */}
      <mesh position={[0, 0, 0.35]}>
        <boxGeometry args={[1.6, 1.2, 0.15]} />
        <meshLambertMaterial color="#4a4a4a" />
      </mesh>
      
      {/* Screen - slightly inset */}
      <mesh ref={screenRef} position={[0, 0.05, 0.43]}>
        <planeGeometry args={[1.3, 0.9]} />
        <meshBasicMaterial 
          color={screenGlow} 
          transparent 
          opacity={flickerIntensity}
        />
      </mesh>
      
      {/* Screen content overlay */}
      <group position={[0, 0.05, 0.44]}>
        {/* Title */}
        <Text
          position={[0, 0.3, 0]}
          fontSize={0.1}
          color="#33ff33"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {content.title}
        </Text>
        
        {/* Formula */}
        <Text
          position={[0, 0.1, 0]}
          fontSize={0.12}
          color="#44ff44"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {content.formula}
        </Text>
        
        {/* Example */}
        <Text
          position={[0, -0.1, 0]}
          fontSize={0.08}
          color="#66ff66"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          Example:
        </Text>
        <Text
          position={[0, -0.25, 0]}
          fontSize={0.1}
          color="#88ff88"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {content.example}
        </Text>
      </group>
      
      {/* Scanlines effect */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[0, -0.35 + i * 0.1, 0.445]}>
          <planeGeometry args={[1.3, 0.01]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.15} />
        </mesh>
      ))}
      
      {/* Screen glow */}
      <pointLight
        position={[0, 0, 0.6]}
        intensity={0.3 * flickerIntensity}
        color="#33ff33"
        distance={2}
      />
      
      {/* Monitor stand */}
      <mesh position={[0, -0.9, 0]} castShadow>
        <boxGeometry args={[0.3, 0.4, 0.3]} />
        <meshLambertMaterial color={crtColor} />
      </mesh>
      
      {/* Monitor base */}
      <mesh position={[0, -1.15, 0]} castShadow>
        <boxGeometry args={[0.8, 0.1, 0.5]} />
        <meshLambertMaterial color={crtColor} />
      </mesh>
      
      {/* Power LED */}
      <mesh position={[0.6, -0.5, 0.41]}>
        <circleGeometry args={[0.03, 8]} />
        <meshBasicMaterial color="#00ff00" />
      </mesh>
      
      {/* Control buttons */}
      {[-0.3, -0.15, 0, 0.15].map((x, i) => (
        <mesh key={i} position={[x, -0.55, 0.41]}>
          <circleGeometry args={[0.04, 8]} />
          <meshLambertMaterial color="#2a2a2a" />
        </mesh>
      ))}
    </group>
  );
}
