import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { installActivityHooks } from './activityLog';

installActivityHooks();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
