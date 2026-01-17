import { Text } from '@react-three/drei';

interface ChalkboardProps {
  position: [number, number, number];
  greeting?: string;
  topic?: string;
  subject?: string;
}

export function Chalkboard({ 
  position, 
  greeting = "Welcome Class!", 
  topic = "Today's Lesson",
  subject = "Learning"
}: ChalkboardProps) {
  return (
    <group position={position}>
      {/* Outer decorative frame - chunky wood */}
      <mesh castShadow>
        <boxGeometry args={[3.4, 2.0, 0.12]} />
        <meshLambertMaterial color="#4a3728" />
      </mesh>
      
      {/* Inner frame border */}
      <mesh position={[0, 0, 0.04]} castShadow>
        <boxGeometry args={[3.2, 1.85, 0.08]} />
        <meshLambertMaterial color="#6b4c3a" />
      </mesh>
      
      {/* Green board surface - slightly worn look */}
      <mesh position={[0, 0, 0.09]}>
        <boxGeometry args={[2.95, 1.55, 0.02]} />
        <meshLambertMaterial color="#1e4d0f" />
      </mesh>
      
      {/* Subtle board texture overlay */}
      <mesh position={[0, 0, 0.1]}>
        <boxGeometry args={[2.9, 1.5, 0.005]} />
        <meshLambertMaterial color="#2a5a1a" transparent opacity={0.6} />
      </mesh>
      
      {/* Main greeting - chunky chalk style */}
      <Text
        position={[0, 0.4, 0.12]}
        fontSize={0.22}
        color="#fffef0"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.05}
        font={undefined}
      >
        {greeting}
      </Text>
      
      {/* Decorative underline */}
      <mesh position={[0, 0.2, 0.11]}>
        <boxGeometry args={[1.8, 0.02, 0.01]} />
        <meshBasicMaterial color="#e8e4d4" transparent opacity={0.7} />
      </mesh>
      
      {/* Subject label */}
      <Text
        position={[0, 0, 0.12]}
        fontSize={0.1}
        color="#d4cfb8"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {subject}
      </Text>
      
      {/* Topic line - slightly bigger for emphasis */}
      <Text
        position={[0, -0.25, 0.12]}
        fontSize={0.14}
        color="#fff8dc"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.02}
        font={undefined}
      >
        {`Today's topic: ${topic}`}
      </Text>
      
      {/* Small decorative stars/doodles */}
      <Text
        position={[-1.2, 0.55, 0.12]}
        fontSize={0.12}
        color="#ffeb99"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        ★
      </Text>
      <Text
        position={[1.2, 0.55, 0.12]}
        fontSize={0.12}
        color="#ffeb99"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        ★
      </Text>
      
      {/* Small earth doodle for geography */}
      <Text
        position={[1.1, -0.5, 0.12]}
        fontSize={0.15}
        color="#87ceeb"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        🌍
      </Text>
      
      {/* Chalk tray - chunky wooden */}
      <mesh position={[0, -0.98, 0.18]} castShadow>
        <boxGeometry args={[2.6, 0.12, 0.18]} />
        <meshLambertMaterial color="#5c4033" />
      </mesh>
      
      {/* Tray front lip */}
      <mesh position={[0, -0.98, 0.28]} castShadow>
        <boxGeometry args={[2.6, 0.08, 0.02]} />
        <meshLambertMaterial color="#4a3525" />
      </mesh>
      
      {/* Chalk pieces - scattered naturally */}
      <mesh position={[-0.6, -0.92, 0.22]} rotation={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.18, 0.07, 0.07]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.2, -0.92, 0.24]} rotation={[0, -0.15, 0]} castShadow>
        <boxGeometry args={[0.14, 0.06, 0.06]} />
        <meshBasicMaterial color="#ffeb3b" />
      </mesh>
      <mesh position={[0.4, -0.92, 0.22]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.1, 0.06, 0.06]} />
        <meshBasicMaterial color="#ff9999" />
      </mesh>
      <mesh position={[0.7, -0.92, 0.23]} rotation={[0, -0.1, 0]} castShadow>
        <boxGeometry args={[0.12, 0.06, 0.06]} />
        <meshBasicMaterial color="#87ceeb" />
      </mesh>
      
      {/* Eraser */}
      <mesh position={[-0.9, -0.9, 0.24]} castShadow>
        <boxGeometry args={[0.2, 0.08, 0.1]} />
        <meshLambertMaterial color="#2a2a2a" />
      </mesh>
    </group>
  );
}
