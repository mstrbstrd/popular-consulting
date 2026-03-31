// Footer.js
import React from 'react';
import twitterIcon from '../assets/icons/twitter.svg';
import instagramIcon from '../assets/icons/instagram.svg';

const Footer = () => {
    const footerStyle = {
        padding: '2rem 0',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(99, 68, 245, 0.1)',
    };
    
    const wrapperStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 2rem',
    };
    
    const titleStyle = {
        fontSize: '1.2rem',
        color: '#555',
        margin: '0 0 1rem 0',
        fontWeight: '400',
    };
    
    const listStyle = {
        display: 'flex',
        gap: '1.5rem',
        padding: 0,
        margin: '1rem 0',
        listStyle: 'none',
    };
    
    const iconStyle = {
        width: '24px',
        height: '24px',
        filter: 'invert(0.5) sepia(0.5) saturate(5) hue-rotate(220deg)',
        opacity: '0.8',
        transition: 'all 0.3s ease',
    };
    
    const hoverEffect = (e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.querySelector('img').style.opacity = '1';
    };
    
    const resetHover = (e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.querySelector('img').style.opacity = '0.8';
    };
    
    return (
        <footer style={{...footerStyle, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"}}>
            <div className="footer-wrapper" style={wrapperStyle}>
                <h5 style={titleStyle}>Popular Consulting 2023 &copy;</h5>
                <ul style={listStyle}>
                    <li>
                        <a 
                            href="https://twitter.com/mstrbstrdd" 
                            title="twitter-social-media" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ display: 'block', transition: 'transform 0.3s ease' }}
                            onMouseOver={hoverEffect}
                            onMouseOut={resetHover}
                        >
                            <img src={twitterIcon} alt="Twitter" style={iconStyle} />
                        </a>
                    </li>
                    <li>
                        <a 
                            href="https://instagram.com" 
                            title="instagram-social-media" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ display: 'block', transition: 'transform 0.3s ease' }}
                            onMouseOver={hoverEffect}
                            onMouseOut={resetHover}
                        >
                            <img src={instagramIcon} alt="Instagram" style={iconStyle} />
                        </a>
                    </li>
                </ul>
            </div>
        </footer>
    );
};

export default Footer;
