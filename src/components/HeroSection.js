import React from 'react';
import VideoSection from './VideoSection';
import heroVideo from '../assets/video/digifire.mp4';

const HeroSection = () => {
    return (
        <VideoSection videoSource={heroVideo} sectionId="hero" className="hero">
            <div className="hero-backdrop">
                <h2>Create Beyond Limits.</h2>
                <h3>Your guide to the future of business and technology.</h3>
            </div>
            <a href="#contact"><button>Contact</button></a>
        </VideoSection>
    );
};

export default HeroSection;
