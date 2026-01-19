import { Desk } from './Desk';
import { TeacherDesk } from './TeacherDesk';
import { Chalkboard } from './Chalkboard';
import { Bookshelf } from './Bookshelf';
import { Plant } from './Plant';

interface FurnitureProps {
  greeting?: string;
  subject?: string;
  topic?: string;
}

export function Furniture({ greeting, subject, topic }: FurnitureProps) {
  return (
    <group>
      {/* Student desks - desk and chair rotated 180 degrees separately */}
      <Desk position={[0, 0, 0]} deskRotation={[0, Math.PI, 0]} chairRotation={[0, Math.PI, 0]} />
      <Desk position={[-2.5, 0, 0]} deskRotation={[0, Math.PI, 0]} chairRotation={[0, Math.PI, 0]} />
      <Desk position={[0, 0, 2.5]} deskRotation={[0, Math.PI, 0]} chairRotation={[0, Math.PI, 0]} />
      <Desk position={[-2.5, 0, 2.5]} deskRotation={[0, Math.PI, 0]} chairRotation={[0, Math.PI, 0]} />
      
      {/* Teacher's area */}
      <TeacherDesk position={[3, 0, -3]} />
      
      {/* Chalkboard on back wall - shows current lesson */}
      <Chalkboard 
        position={[-2, 2.5, -4.7]} 
        greeting={greeting}
        subject={subject}
        topic={topic}
      />
      
      {/* Bookshelf */}
      <Bookshelf position={[4.5, 0, -4]} />
      
      {/* Decorative plant */}
      <Plant position={[5, 0, 3.5]} />
    </group>
  );
}
