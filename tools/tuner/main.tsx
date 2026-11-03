import { createRoot } from 'react-dom/client';
import '../../src/ui/styles.css';
import './tuner.css';
import { TunerApp } from './TunerApp.tsx';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root がない');
}
createRoot(container).render(<TunerApp />);
