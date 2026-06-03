import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tailwind.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
// Data-source redesign: IBM Plex Sans (body) + JetBrains Mono (mono identity).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './i18n/config';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n/config';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from './providers/QueryProvider';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
    <QueryProvider>
        <I18nextProvider i18n={i18n}>
            <App />
            <Toaster duration={2000} richColors closeButton />
        </I18nextProvider>
    </QueryProvider>
);
