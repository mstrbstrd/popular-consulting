// App.js
import React from 'react';
import NavMenu from './components/NavMenu';
import HeroSection from './components/HeroSection';
import BioSection from './components/BioSection';
import ContactSection from './components/ContactSection';
import Footer from './components/Footer';
import ServicesSection from './components/ServicesSection';

const App = () => {
  return (
    <div>
      <NavMenu />
      <HeroSection />
      <BioSection />
      <ServicesSection />
      <ContactSection />
      <Footer />
    </div>
  );
}

export default App;
