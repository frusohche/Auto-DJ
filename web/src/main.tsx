import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { RemoteApp } from './remote/RemoteApp.tsx';
import './app.css';

// /r/CODE is the phone remote; everything else is the player.
const isRemote = /^\/r(\/|$)/.test(location.pathname);
createRoot(document.getElementById('root')!).render(isRemote ? <RemoteApp /> : <App />);
