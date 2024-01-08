import React, { useState } from 'react';
import LoadingComponent from './LoadingComponent';

const VideoSection = ({ videoSource, sectionId, className, children }) => {
    const [isLoading, setIsLoading] = useState(true);

    const handleLoadedData = () => {
        setIsLoading(false);
    };

    return (
        <section id={sectionId}>
            <div className={className}>
                {isLoading && <LoadingComponent />}
                <video autoPlay muted loop id={className + "Video"} className={className + "Video"} onLoadedData={handleLoadedData}>
                    <source src={videoSource} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
                {children}
            </div>
        </section>
    );
};

export default VideoSection;
