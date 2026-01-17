import { useRef } from 'react';
import * as THREE from 'three';

export function Room() {
  const floorRef = useRef<THREE.Mesh>(null);
  
  // Pastel color palette - Sims 1 style
  const floorColor = "#e8d4b8"; // Warm wood tone
  const wallColor = "#f5ebe0"; // Soft cream
  const trimColor = "#c9b896"; // Darker trim
  
  return (
    <group>
      {/* Floor - wooden planks look */}
      <mesh
        ref={floorRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[12, 10]} />
        <meshLambertMaterial color={floorColor} />
      </mesh>
      
      {/* Floor grid lines for wood plank effect */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={`plank-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-5.5 + i, 0.01, 0]}
        >
          <planeGeometry args={[0.02, 10]} />
          <meshBasicMaterial color={trimColor} />
        </mesh>
      ))}
      
      {/* Back wall */}
      <mesh position={[0, 3, -5]} receiveShadow>
        <boxGeometry args={[12, 6, 0.3]} />
        <meshLambertMaterial color={wallColor} />
      </mesh>
      
      {/* Left wall */}
      <mesh position={[-6, 3, 0]} receiveShadow>
        <boxGeometry args={[0.3, 6, 10]} />
        <meshLambertMaterial color={wallColor} />
      </mesh>
      
      {/* Wall trim - back */}
      <mesh position={[0, 0.15, -4.85]}>
        <boxGeometry args={[12, 0.3, 0.15]} />
        <meshLambertMaterial color={trimColor} />
      </mesh>
      
      {/* Wall trim - left */}
      <mesh position={[-5.85, 0.15, 0]}>
        <boxGeometry args={[0.15, 0.3, 10]} />
        <meshLambertMaterial color={trimColor} />
      </mesh>
      
      {/* Ceiling border decoration */}
      <mesh position={[0, 5.85, -4.85]}>
        <boxGeometry args={[12, 0.2, 0.2]} />
        <meshLambertMaterial color={trimColor} />
      </mesh>
      
      {/* Window on back wall */}
      <group position={[3, 3.5, -4.8]}>
        {/* Sky/outside view behind window - pushed back into wall */}
        <mesh position={[0, 0, -0.2]}>
          <planeGeometry args={[1.7, 1.7]} />
          <meshBasicMaterial color="#87CEEB" />
        </mesh>
        
        {/* Simple clouds */}
        <mesh position={[-0.4, 0.4, -0.15]}>
          <circleGeometry args={[0.2, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[-0.2, 0.45, -0.15]}>
          <circleGeometry args={[0.15, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.5, 0.3, -0.15]}>
          <circleGeometry args={[0.18, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.7, 0.35, -0.15]}>
          <circleGeometry args={[0.12, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        
        {/* Sun */}
        <mesh position={[0.6, 0.6, -0.15]}>
          <circleGeometry args={[0.15, 16]} />
          <meshBasicMaterial color="#FFE4B5" />
        </mesh>
        
        {/* Window frame - outer */}
        <mesh position={[0, 0, 0.1]}>
          <boxGeometry args={[2.2, 2.2, 0.15]} />
          <meshLambertMaterial color={trimColor} />
        </mesh>
        
        {/* Window opening (cuts into frame) */}
        <mesh position={[0, 0, 0.15]}>
          <boxGeometry args={[1.8, 1.8, 0.1]} />
          <meshLambertMaterial color="#87CEEB" />
        </mesh>
        
        {/* Window cross - vertical */}
        <mesh position={[0, 0, 0.22]}>
          <boxGeometry args={[0.08, 1.8, 0.08]} />
          <meshLambertMaterial color={trimColor} />
        </mesh>
        {/* Window cross - horizontal */}
        <mesh position={[0, 0, 0.22]}>
          <boxGeometry args={[1.8, 0.08, 0.08]} />
          <meshLambertMaterial color={trimColor} />
        </mesh>
        
        {/* Inner frame detail */}
        <mesh position={[0, 0.9, 0.2]}>
          <boxGeometry args={[1.85, 0.05, 0.05]} />
          <meshLambertMaterial color={trimColor} />
        </mesh>
        <mesh position={[0, -0.9, 0.2]}>
          <boxGeometry args={[1.85, 0.05, 0.05]} />
          <meshLambertMaterial color={trimColor} />
        </mesh>
        <mesh position={[0.9, 0, 0.2]}>
          <boxGeometry args={[0.05, 1.85, 0.05]} />
          <meshLambertMaterial color={trimColor} />
        </mesh>
        <mesh position={[-0.9, 0, 0.2]}>
          <boxGeometry args={[0.05, 1.85, 0.05]} />
          <meshLambertMaterial color={trimColor} />
        </mesh>
      </group>
    </group>
  );
}
