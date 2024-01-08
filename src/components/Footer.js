// Footer.js
import React from 'react';
import twitterIcon from '../assets/icons/twitter.svg'; // Adjust the path as necessary
import instagramIcon from '../assets/icons/instagram.svg'; // Adjust the path as necessary

const Footer = () => {
    return (
        <footer>
            <div className="footer-wrapper">
                <h5>Popular Consulting 2023 &copy;</h5>
                <ul>
                    <li>
                      <a href="https://twitter.com/mstrbstrdd" title="twitter-social-media">
                        <img src={twitterIcon} alt="twitter-social-media" />
                      </a>
                    </li>
                    {/* ... other social media links */}
                </ul>
            </div>
        </footer>
    );
};

export default Footer;
