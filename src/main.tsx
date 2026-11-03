import { createRoot } from 'react-dom/client';
import { DataSummary } from './ui/DataSummary.tsx';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root がない');
}
createRoot(container).render(<DataSummary />);
