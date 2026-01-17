import { Desk } from './Desk';
import { TeacherDesk } from './TeacherDesk';
import { Chalkboard } from './Chalkboard';
import { Bookshelf } from './Bookshelf';
import { Plant } from './Plant';
import { mockLessonInfo } from './mockData';

export function Furniture() {
  return (
    <group>
      {/* Student desks - arranged in a small grid */}
      <Desk position={[0, 0, 0]} />
      <Desk position={[-2.5, 0, 0]} />
      <Desk position={[0, 0, 2.5]} />
      <Desk position={[-2.5, 0, 2.5]} />
      
      {/* Teacher's area */}
      <TeacherDesk position={[3, 0, -3]} />
      
      {/* Chalkboard on back wall - shows current lesson */}
      <Chalkboard 
        position={[-2, 2.5, -4.7]} 
        greeting={mockLessonInfo.greeting}
        subject={mockLessonInfo.subject}
        topic={mockLessonInfo.topic}
      />
      
      {/* Bookshelf */}
      <Bookshelf position={[4.5, 0, -4]} />
      
      {/* Decorative plant */}
      <Plant position={[5, 0, 3.5]} />
    </group>
  );
}
