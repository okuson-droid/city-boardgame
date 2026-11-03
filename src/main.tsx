import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './ui/styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root がない');
}
createRoot(container).render(<App />);
