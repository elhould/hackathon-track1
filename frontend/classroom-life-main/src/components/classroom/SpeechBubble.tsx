import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

interface SpeechBubbleProps {
  position: [number, number, number];
  text: string;
  isStudent?: boolean;
  maxLines?: number;
}

export function SpeechBubble({ position, text, isStudent = false, maxLines = 5 }: SpeechBubbleProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Gentle floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5 + (isStudent ? 0 : 1)) * 0.05;
    }
  });

  const bubbleColor = isStudent ? "#e8f4fd" : "#fff8e8";
  const borderColor = isStudent ? "#7eb8da" : "#e8c170";

  // Calculate bubble dimensions based on text
  const { displayText, bubbleWidth, bubbleHeight } = useMemo(() => {
    const maxWidth = 2.2;
    const fontSize = 0.12;
    const charsPerLine = Math.floor(maxWidth / (fontSize * 0.55)); // Approximate chars per line
    const padding = 0.3;

    // Strip markdown formatting for display
    const cleanText = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
      .replace(/\*([^*]+)\*/g, '$1')       // Remove *italic*
      .replace(/__([^_]+)__/g, '$1')       // Remove __bold__
      .replace(/_([^_]+)_/g, '$1');        // Remove _italic_

    // Show the END of the text (most recent words) - sliding window
    const maxChars = charsPerLine * maxLines;
    let truncatedText = cleanText;
    if (cleanText.length > maxChars) {
      // Take the last maxChars characters, starting from a word boundary
      const startIndex = cleanText.length - maxChars;
      const spaceIndex = cleanText.indexOf(' ', startIndex);
      truncatedText = '...' + cleanText.slice(spaceIndex > 0 ? spaceIndex + 1 : startIndex);
    }

    // Estimate number of lines
    const estimatedLines = Math.ceil(truncatedText.length / charsPerLine);
    const lines = Math.min(estimatedLines, maxLines);

    // Calculate dimensions
    const lineHeight = fontSize * 1.4;
    const height = Math.max(0.5, lines * lineHeight + padding);
    const width = maxWidth;

    return {
      displayText: truncatedText,
      bubbleWidth: width,
      bubbleHeight: height,
    };
  }, [text, maxLines]);

  const halfHeight = bubbleHeight / 2;
  const halfWidth = bubbleWidth / 2;

  return (
    <Billboard position={position} follow={true} renderOrder={1000}>
      <group ref={groupRef}>
        {/* Bubble background - border */}
        <mesh position={[0, 0, -0.01]} renderOrder={1000}>
          <planeGeometry args={[bubbleWidth + 0.1, bubbleHeight + 0.1]} />
          <meshBasicMaterial color={borderColor} depthTest={false} />
        </mesh>

        {/* Bubble background - fill */}
        <mesh renderOrder={1001}>
          <planeGeometry args={[bubbleWidth, bubbleHeight]} />
          <meshBasicMaterial color={bubbleColor} depthTest={false} />
        </mesh>

        {/* Rounded corners effect - corner circles */}
        {[
          [-halfWidth + 0.05, halfHeight - 0.05],
          [halfWidth - 0.05, halfHeight - 0.05],
          [-halfWidth + 0.05, -halfHeight + 0.05],
          [halfWidth - 0.05, -halfHeight + 0.05],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]} renderOrder={1001}>
            <circleGeometry args={[0.08, 8]} />
            <meshBasicMaterial color={bubbleColor} depthTest={false} />
          </mesh>
        ))}

        {/* Speech pointer/tail */}
        <mesh position={[isStudent ? -0.3 : 0.3, -halfHeight - 0.15, -0.01]} rotation={[0, 0, isStudent ? 0.3 : -0.3]} renderOrder={1001}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={3}
              array={new Float32Array([
                0, 0.2, 0,
                -0.12, -0.15, 0,
                0.12, -0.15, 0,
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <meshBasicMaterial color={bubbleColor} side={THREE.DoubleSide} depthTest={false} />
        </mesh>

        {/* Text */}
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.12}
          color="#2d3748"
          anchorX="center"
          anchorY="middle"
          maxWidth={bubbleWidth - 0.2}
          textAlign="center"
          lineHeight={1.4}
          renderOrder={1002}
          material-depthTest={false}
        >
          {displayText}
        </Text>
      </group>
    </Billboard>
  );
}
