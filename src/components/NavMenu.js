// Header.js
import React from 'react';
import logo from '../assets/icons/popcon2.png'; // Adjust the path as necessary

const NavMenu = () => {
    return (
        <header className="main-head">
            <nav>
                <img href="/" src={logo} alt="logo" width="5%" />
                <h1 id="logo">Popular Consulting</h1>
                <ul>
                    <li><a href="#bio">About</a></li>
                    <li><a href="#services">Services</a></li>
                    <li><a href="#contact">Contact</a></li>
                    <li><a href="https://www.popularconsumption.xyz/">Blog</a></li>
                </ul>
            </nav>
        </header>
    );
};

export default NavMenu;
