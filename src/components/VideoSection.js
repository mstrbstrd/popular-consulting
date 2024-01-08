import React from 'react';

const VideoSection = ({ videoSource, sectionId, className, children }) => {
    return (
        <section id={sectionId}>
            <div className={className}>
                <video autoPlay muted loop id={className + "Video"} className={className + "Video"}>
                    <source src={videoSource} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
                {children}
            </div>
        </section>
    );
};

export default VideoSection;
