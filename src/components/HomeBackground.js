import React from 'react';
import ImmersiveBackground from './ImmersiveBackground';

export default function HomeBackground({ activeSection = 0 }) {
  return <ImmersiveBackground activeSection={activeSection} />;
}
