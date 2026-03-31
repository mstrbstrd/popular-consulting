import './patchResizeObserver'; // must be first — patches global before React/MUI load
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// ResizeObserver fires this benign warning when its callback can't deliver all
// notifications within a single animation frame. It does not indicate a bug and
// is safe to ignore. Without this suppression, CRA's dev overlay treats it as a
// fatal error and crashes the UI whenever DevTools or the viewport resizes.

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
