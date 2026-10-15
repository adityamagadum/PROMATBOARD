import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { QuickSave } from '../components/QuickSave';
import { useVault } from '../lib/store';
import { applyCachedTheme } from './theme';

applyCachedTheme();
void useVault.getState().init();
createRoot(document.getElementById('root')!).render(<QuickSave />);
