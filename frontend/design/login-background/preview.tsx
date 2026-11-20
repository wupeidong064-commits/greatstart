import { createRoot } from 'react-dom/client';
import LoginBackground from '../../src/components/login/LoginBackground';

const host = document.querySelector('#login-imprint');
if (host) createRoot(host).render(<LoginBackground />);
