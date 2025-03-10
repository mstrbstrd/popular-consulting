import React from 'react';
import { Container, TextField, Button, Typography, useTheme, useMediaQuery } from '@mui/material';
import twitterIcon from '../assets/icons/twitter.svg';
import instagramIcon from '../assets/icons/instagram.svg';
import logo from '../assets/icons/popcon_png.png';

const ContactSection = ({ isActive }) => {
    // Reference to main content div for animations
    const contentRef = React.useRef(null);
    const footerRef = React.useRef(null);
    const [scrollOutStarted, setScrollOutStarted] = React.useState(false);

    // Handle section transition effects for both form and footer
    React.useEffect(() => {
        const initContactSection = () => {
            console.log("Initializing ContactSection, isActive:", isActive);
            
            // Wait for DOM to be ready
            setTimeout(() => {
                // Make sure refs are valid
                if (!contentRef.current || !footerRef.current) return;
                
                // Get the elements
                const contentEl = contentRef.current;
                const footerEl = footerRef.current;
                
                if (isActive) {
                    console.log("ContactSection becoming active");
                    // Reset scroll out flag
                    setScrollOutStarted(false);
                    
                    // ENTRY ANIMATION for form
                    contentEl.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';
                    contentEl.style.transform = 'translateY(0)';
                    contentEl.style.opacity = '1';
                    
                    // ENTRY ANIMATION for footer - with a delay
                    footerEl.style.transition = 'transform 0.8s ease-out 0.2s, opacity 0.8s ease-out 0.2s';
                    footerEl.style.transform = 'translateY(0)';
                    footerEl.style.opacity = '1';
                } 
                else if (!scrollOutStarted) {
                    console.log("ContactSection becoming inactive");
                    // EXIT ANIMATION
                    setScrollOutStarted(true);
                    
                    // Apply the exit animation to form
                    contentEl.style.transition = 'transform 0.8s cubic-bezier(0.2, 0.0, 0.15, 1), opacity 0.8s ease-out';
                    contentEl.style.transform = 'translateY(-100vh)';
                    contentEl.style.opacity = '0';
                    
                    // Apply exit animation to footer (slightly faster to disappear first)
                    footerEl.style.transition = 'transform 0.6s cubic-bezier(0.2, 0.0, 0.15, 1), opacity 0.6s ease-out';
                    footerEl.style.transform = 'translateY(100px)';
                    footerEl.style.opacity = '0';
                }
            }, 10); // Small timeout to ensure DOM is ready
        };
        
        // Initialize the section
        initContactSection();
        
    }, [isActive, scrollOutStarted]);
    
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const containerStyles = {
        backgroundColor: 'rgba(255, 255, 255, 0.1)', // More transparent
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: '24px',
        p: 3, // Reduced padding (from 4)
        position: 'relative',
        zIndex: 2,
        margin: 'auto',
        marginTop: '0', // No top margin
        marginBottom: '1rem', // Reduced bottom margin
        width: '80%',
        maxWidth: '1200px',
        minWidth: isMobile ? '300px' : '500px',
        border: '1px solid rgba(255, 255, 255, 0.2)', // Lighter border for more realistic glass
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1), 0 0 20px rgba(255, 255, 255, 0.05), inset 0 0 4px rgba(255, 255, 255, 0.2)', // Multiple shadows for depth
        transition: 'all 0.3s ease',
        '&:hover': {
            boxShadow: '0 25px 45px rgba(0, 0, 0, 0.12), 0 0 25px rgba(255, 255, 255, 0.06), inset 0 0 5px rgba(255, 255, 255, 0.25)',
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
        },
        '&::before': { // Subtle inner highlight
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0))',
            zIndex: -1,
        },
    };

    const textFieldStyles = {
        marginBottom: '1rem', // Reduced from 1.5rem
        '& .MuiFilledInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.05) !important', // Glass effect for inputs
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: 'inset 0 1px 5px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.3s ease',
            overflow: 'hidden',
            '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1) !important',
                boxShadow: 'inset 0 1px 5px rgba(0, 0, 0, 0.08)',
            },
            '&.Mui-focused': {
                backgroundColor: 'rgba(255, 255, 255, 0.15) !important',
                boxShadow: 'inset 0 1px 5px rgba(0, 0, 0, 0.1)',
                borderColor: 'rgba(99, 68, 245, 0.3)', // Subtle highlight that matches theme
            },
            '&::before, &::after': {
                display: 'none', // Remove Material UI default underlines
            },
            // Add shimmer effect on hover
            '&::before': {
                content: '""',
                position: 'absolute',
                top: '-50%',
                left: '-50%',
                width: '200%',
                height: '200%',
                background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%)',
                transform: 'rotate(30deg)',
                transition: 'all 0.5s ease',
                opacity: 0,
                zIndex: 0,
            },
            '&:hover::before': {
                opacity: 1,
                left: '100%',
            },
        },
        '& .MuiFilledInput-input': {
            color: 'rgba(0, 0, 0, 0.8)', // Darker text for better readability
            fontWeight: '500',
            padding: '16px 20px',
            zIndex: 1,
            position: 'relative',
        },
        '& .MuiInputLabel-root': {
            color: 'rgba(0, 0, 0, 0.6)',
            fontWeight: '500',
            marginLeft: '8px',
            '&.Mui-focused': {
                color: '#6344F5',
            },
        },
    };

    const buttonStyles = {
        marginTop: '1rem', // Reduced from 2rem
        fontWeight: 'bold',
        fontSize: '1rem', // Slightly smaller
        padding: '10px 24px', // Smaller padding
        background: 'linear-gradient(to right, #6344F5, #9C55FF)',
        borderRadius: '12px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 20px rgba(99, 68, 245, 0.25), 0 2px 5px rgba(156, 85, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.3)',
        '&:hover': {
            background: 'linear-gradient(to right, #7355F6, #A465FF)',
            boxShadow: '0 12px 25px rgba(108, 68, 245, 0.4), 0 4px 10px rgba(156, 85, 255, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
            transform: 'translateY(-3px)',
        },
        '&:active': {
            transform: 'translateY(-1px)',
            boxShadow: '0 5px 15px rgba(108, 68, 245, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
        },
        transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        '&::before': { // Shimmer effect
            content: '""',
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)',
            transform: 'rotate(30deg)',
            transition: 'all 0.8s ease',
            opacity: 0,
        },
        '&:hover::before': {
            opacity: 1,
            left: '100%',
        }
    };

    // Footer style as a container rather than absolute positioning
    const footerContainerStyle = {
        width: '100%',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '18px 18px 0 0',
        padding: '1.2rem 2rem',
        marginTop: '1.5rem',
        boxShadow: '0 -5px 20px rgba(0, 0, 0, 0.05), 0 0 15px rgba(255, 255, 255, 0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'all 0.5s ease-out',
        opacity: 0, // Start hidden
        transform: 'translateY(50px)', // Start below view
        // Initial styles will be overridden by the useEffect animation
    };

    return (
        <section id="contact" style={{ 
            height: "100vh", 
            display: "flex", 
            flexDirection: "column",
            alignItems: "center", 
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
        }}>
            {/* Subtle glow effect behind the content */}
            <div style={{
                position: "absolute",
                width: "80%",
                height: "70%",
                background: "radial-gradient(circle, rgba(99, 68, 245, 0.03) 0%, rgba(156, 85, 255, 0.02) 40%, rgba(255, 255, 255, 0) 70%)",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 1,
                pointerEvents: "none"
            }}></div>
            
            {/* Main flex container for both form and footer */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start', // Start from the top rather than center
                width: '100%',
                height: '100%',
                maxWidth: '1200px',
                padding: '2rem',
                paddingTop: '4rem', // Start a bit lower from the top
                paddingBottom: '1rem', // Less padding at bottom
            }}>
                {/* Contact Form Container */}
                <div 
                    ref={contentRef}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        maxWidth: isMobile ? '100%' : '800px',
                        opacity: 0, // Initially hidden, will be animated in useEffect
                        transform: 'translateY(30px)', // Initially offset, will be animated in useEffect
                        marginBottom: '1rem', // Less margin at bottom
                        flex: '0 1 auto', // Don't grow, allow shrinking
                    }}
                >
                    <Container 
                        sx={{
                            ...containerStyles,
                            width: '100%',
                            '&::after': {
                                content: '""',
                                position: 'absolute',
                                top: '-1px',
                                left: '-1px',
                                right: '-1px',
                                bottom: '-1px',
                                borderRadius: '25px',
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(99, 68, 245, 0.05), rgba(156, 85, 255, 0.05), rgba(255,255,255,0.1))',
                                zIndex: -1,
                                opacity: 0.5,
                                filter: 'blur(2px)',
                                transition: 'opacity 0.3s ease',
                            },
                            '&:hover::after': {
                                opacity: 0.7,
                            }
                        }} 
                        className="contact-form glass-card"
                    >
                        <Typography 
                            variant="h2" 
                            gutterBottom 
                            color="#333"
                            sx={{
                                textAlign: 'center',
                                fontWeight: '900',
                                marginBottom: '1.5rem', // Reduced from 2.5rem
                                fontSize: 'clamp(2.5rem, 6vw, 4rem)', // Slightly smaller
                                backgroundImage: 'linear-gradient(90deg, #9C55FF, #6344F5, #B15DFF)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                textFillColor: 'transparent',
                                letterSpacing: '-0.02em',
                                textShadow: '0 2px 10px rgba(99, 68, 245, 0.1)',
                                position: 'relative',
                                '&::after': {
                                    content: '""',
                                    position: 'absolute',
                                    bottom: '-10px', // Reduced from -15px
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: '80px',
                                    height: '4px',
                                    background: 'linear-gradient(to right, rgba(99, 68, 245, 0.3), rgba(156, 85, 255, 0.3))',
                                    borderRadius: '2px',
                                }
                            }}
                        >
                            Contact Us
                        </Typography>
                        <form 
                            action="https://formspree.io/f/mrgvbgww" 
                            method="POST" 
                            style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: 4,
                                position: 'relative',
                                zIndex: 2
                            }}
                        >
                            {/* Glass sparkle effects */}
                            <div style={{
                                position: 'absolute',
                                top: '10%',
                                left: '5%',
                                width: '30px',
                                height: '30px',
                                background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)',
                                borderRadius: '50%',
                                opacity: 0.4,
                                zIndex: 1,
                            }}></div>
                            <div style={{
                                position: 'absolute',
                                bottom: '20%',
                                right: '8%',
                                width: '20px',
                                height: '20px',
                                background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)',
                                borderRadius: '50%',
                                opacity: 0.3,
                                zIndex: 1,
                            }}></div>
                            <TextField
                                id="name"
                                label="Name"
                                variant="filled"
                                type="text"
                                name="name"
                                required
                                fullWidth
                                sx={textFieldStyles}
                            />
                            <TextField
                                id="email"
                                label="Email"
                                variant="filled"
                                type="email"
                                name="email"
                                required
                                fullWidth
                                sx={textFieldStyles}
                            />
                            <TextField
                                id="message"
                                label="Message"
                                variant="filled"
                                multiline
                                rows={3} // Reduced from 4
                                name="message"
                                required
                                fullWidth
                                sx={textFieldStyles}
                            />
                            <Button 
                                type="submit" 
                                variant="contained" 
                                size="large"
                                sx={buttonStyles}
                            >
                                Submit
                            </Button>
                        </form>
                    </Container>
                </div>

                {/* Footer section with social links - more compact */}
                <div 
                    ref={footerRef}
                    style={{
                        ...footerContainerStyle,
                        maxWidth: isMobile ? '95%' : '800px',
                        margin: '0 auto',
                        flexDirection: isMobile ? 'column' : 'row',
                        padding: '0.8rem 2rem', // Reduced padding for more compact footer
                        marginTop: '-0.5rem', // Pull it up slightly
                        justifyContent: 'space-between', // Space elements evenly
                        alignItems: 'center',
                    }}
                >
                    {/* Copyright text */}
                    <Typography 
                        variant="body2" 
                        sx={{
                            fontSize: '0.9rem',
                            color: 'rgba(0, 0, 0, 0.6)',
                            fontWeight: '500',
                            textAlign: 'center',
                            margin: isMobile ? '0.5rem 0' : 0,
                            order: isMobile ? 3 : 1, // Change order for mobile
                        }}
                    >
                        Popular Consulting © {new Date().getFullYear()}
                    </Typography>
                    
                    {/* Logo in center with highlight circle */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        margin: isMobile ? '0.5rem 0' : 0,
                        order: isMobile ? 1 : 2, // First on mobile, middle on desktop
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '45px',
                            height: '45px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(99, 68, 245, 0.1))',
                            boxShadow: '0 2px 8px rgba(99, 68, 245, 0.2)',
                            transition: 'all 0.3s ease',
                        }}>
                            <img 
                                src={logo} 
                                alt="Popular Consulting Logo" 
                                style={{
                                    height: '32px', // Sized to fit in container
                                    width: 'auto',
                                    opacity: 0.95, // Much less transparent
                                    transition: 'all 0.3s ease',
                                    filter: 'drop-shadow(0 0 3px rgba(99, 68, 245, 0.2)) contrast(1.1)', // Add subtle glow and more contrast
                                    transform: 'scale(1.05)', // Slightly larger
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.opacity = 1;
                                    e.currentTarget.style.filter = 'drop-shadow(0 0 5px rgba(99, 68, 245, 0.4)) contrast(1.15)';
                                    e.currentTarget.style.transform = 'scale(1.1)';
                                    e.currentTarget.parentElement.style.boxShadow = '0 3px 10px rgba(99, 68, 245, 0.3)';
                                    e.currentTarget.parentElement.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(99, 68, 245, 0.15))';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.opacity = 0.95;
                                    e.currentTarget.style.filter = 'drop-shadow(0 0 3px rgba(99, 68, 245, 0.2)) contrast(1.1)';
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                    e.currentTarget.parentElement.style.boxShadow = '0 2px 8px rgba(99, 68, 245, 0.2)';
                                    e.currentTarget.parentElement.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(99, 68, 245, 0.1))';
                                }}
                            />
                        </div>
                    </div>
                    
                    {/* Social media links */}
                    <div style={{
                        display: 'flex',
                        gap: '1.5rem',
                        padding: 0,
                        margin: isMobile ? '0.5rem 0' : 0,
                        justifyContent: 'center',
                        order: isMobile ? 2 : 3, // Middle on mobile, last on desktop
                    }}>
                        <a 
                            href="https://twitter.com/mstrbstrdd" 
                            title="Twitter" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '38px',
                                height: '38px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(5px)',
                                WebkitBackdropFilter: 'blur(5px)',
                                borderRadius: '50%',
                                transition: 'all 0.3s ease',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-3px)';
                                e.currentTarget.style.boxShadow = '0 5px 15px rgba(99, 68, 245, 0.2)';
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                e.currentTarget.querySelector('img').style.filter = 'invert(0.5) sepia(0.5) saturate(5) hue-rotate(220deg) brightness(1.2)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.05)';
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.querySelector('img').style.filter = 'invert(0.5) sepia(0.5) saturate(5) hue-rotate(220deg)';
                            }}
                        >
                            <img 
                                src={twitterIcon} 
                                alt="Twitter" 
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    filter: 'invert(0.5) sepia(0.5) saturate(5) hue-rotate(220deg)',
                                    transition: 'all 0.3s ease',
                                }}
                            />
                        </a>
                        <a 
                            href="https://instagram.com" 
                            title="Instagram" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '38px',
                                height: '38px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(5px)',
                                WebkitBackdropFilter: 'blur(5px)',
                                borderRadius: '50%',
                                transition: 'all 0.3s ease',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-3px)';
                                e.currentTarget.style.boxShadow = '0 5px 15px rgba(99, 68, 245, 0.2)';
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                e.currentTarget.querySelector('img').style.filter = 'invert(0.5) sepia(0.5) saturate(5) hue-rotate(220deg) brightness(1.2)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.05)';
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.querySelector('img').style.filter = 'invert(0.5) sepia(0.5) saturate(5) hue-rotate(220deg)';
                            }}
                        >
                            <img 
                                src={instagramIcon} 
                                alt="Instagram" 
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    filter: 'invert(0.5) sepia(0.5) saturate(5) hue-rotate(220deg)',
                                    transition: 'all 0.3s ease',
                                }}
                            />
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ContactSection;
