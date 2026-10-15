import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { App } from '../components/App';
import { useVault } from '../lib/store';
import { applyCachedTheme } from './theme';
import { useUI } from '../lib/ui';

// Dev-only handle for debugging in the browser console (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __pv: { useVault, useUI } });

applyCachedTheme();
void useVault.getState().init();
createRoot(document.getElementById('root')!).render(<App />);
