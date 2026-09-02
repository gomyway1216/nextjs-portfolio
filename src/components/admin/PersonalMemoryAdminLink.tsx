import { BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

interface PersonalMemoryAdminLinkProps {
  style?: CSSProperties;
}

export default function PersonalMemoryAdminLink({ style }: PersonalMemoryAdminLinkProps) {
  return (
    <Link
      href="/memory?view=private"
      className="admin-console__nav-button"
      style={style}
    >
      <BrainCircuit size={18} />
      Personal Memory
    </Link>
  );
}
