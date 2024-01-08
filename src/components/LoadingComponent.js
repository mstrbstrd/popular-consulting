import React from 'react';
import '../styles/LoadingComponent.css';
import loaderimage from '../assets/icons/movingwave.gif';

function LoadingComponent() {
  return (
    <div className="loading">
      <img src={loaderimage} alt="Loading..." />
    </div>
  );
}

export default LoadingComponent;