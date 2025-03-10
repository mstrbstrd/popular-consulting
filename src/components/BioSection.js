// BioSection.js
import React, { useState, useEffect, useRef } from 'react';
import logo from "../assets/icons/popcon_svg.svg";

const BioSection = ({ isActive, sectionIndex, enterDirection, exitDirection }) => {
    // Track animation state
    const [animationComplete, setAnimationComplete] = useState(false);
    const [scrollOutStarted, setScrollOutStarted] = useState(false);
    const contentRef = useRef(null);
    
    // State for typewriter text animation
    const [text, setText] = useState({ title: "", subtitle: "", paragraph: "" });
    const [typingPhase, setTypingPhase] = useState("title");
    const [showCursor, setShowCursor] = useState(true);
    
    // Debug to see if props are being received - only in development
    if (process.env.NODE_ENV !== 'production') {
        console.log(`BioSection rendered, isActive: ${isActive}, index: ${sectionIndex}, enterDirection: ${enterDirection}, exitDirection: ${exitDirection}`);
    }
    
    // Handle section transition effects - simplified version
    useEffect(() => {
        // Function to initialize bio section
        const initBioSection = () => {
            console.log("Initializing BioSection, isActive:", isActive);
            
            // Force a layout calculation
            setTimeout(() => {
                // Make sure refs are still valid
                if (!contentRef.current) return;
                
                // Get the content element
                const contentEl = contentRef.current;
                
                // Get the logo element
                const logoElement = document.querySelector('.bio-logo');
                
                if (isActive) {
                    console.log("BioSection becoming active");
                    // Reset scroll out flag
                    setScrollOutStarted(false);
                    
                    // ENTRY ANIMATION - fade in and up from below
                    contentEl.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';
                    contentEl.style.transform = 'translateY(0)';
                    contentEl.style.opacity = '1';
                    
                    // Animate the logo in
                    if (logoElement) {
                        logoElement.style.transition = 'opacity 0.6s ease-out';
                        logoElement.style.opacity = '0.2';
                    }
                } 
                else if (!scrollOutStarted) {
                    console.log("BioSection becoming inactive");
                    // EXIT ANIMATION - slide up and out
                    setScrollOutStarted(true);
                    
                    // Apply the exit animation
                    contentEl.style.transition = 'transform 0.8s cubic-bezier(0.2, 0.0, 0.15, 1), opacity 0.8s ease-out';
                    contentEl.style.transform = 'translateY(-100vh)';
                    contentEl.style.opacity = '0';
                    
                    // Animate the logo out too
                    if (logoElement) {
                        logoElement.style.transition = 'transform 0.8s cubic-bezier(0.2, 0.0, 0.15, 1), opacity 0.8s ease-out';
                        logoElement.style.opacity = '0';
                        logoElement.style.transform = 'translate(-50%, -50%) translateY(-100vh) scale(0.8)';
                    }
                }
            }, 10); // Very small timeout to ensure DOM is ready
        };
        
        // Initialize the section
        initBioSection();
        
    }, [isActive, scrollOutStarted]);
    
    // Handle typewriter animation when section becomes active
    useEffect(() => {
        let cursorBlinkInterval;
        let typingTimer;
        
        // Reset animation states if section becomes inactive
        if (!isActive) {
            setText({ title: "", subtitle: "", paragraph: "" });
            setTypingPhase("title");
            setAnimationComplete(false);
            clearInterval(cursorBlinkInterval);
            clearTimeout(typingTimer);
            return;
        }
        
        // Configure the text content
        const content = {
            title: "Empower Your Workforce with AI",
            subtitle: "Transform your business operations with tailored AI training for your team.",
            paragraph: "Discover how integrating artificial intelligence and machine learning into your daily workflows can boost efficiency, enhance decision-making, and drive innovation. Our expert-led training programs are designed to equip your team with the necessary skills to harness the power of these cutting-edge technologies, custom-tailored to your industry's specific needs."
        };
        
        // Set up cursor blinking (faster for double-speed title)
        cursorBlinkInterval = setInterval(() => {
            setShowCursor(prev => !prev);
        }, 350); // Faster than original (500ms) for double speed title
        
        // The entire typewriter animation sequence
        const runTypewriterSequence = async () => {
            // Set initial state, making paragraph completely hidden
            setText({
                title: "",
                subtitle: "",
                paragraph: content.paragraph // Content is set but will be hidden by visibility:hidden
            });
            
            // Small delay to ensure layout is calculated properly
            await sleep(50);
            
            // Type title with a delay to ensure section is visible (double speed)
            await sleep(150); // Reduced from 300 for double speed
            setTypingPhase("title");
            await typeText("title", content.title);
            
            // Pause before subtitle (3x faster)
            await sleep(200); // reduced from 600
            
            // Type subtitle
            setTypingPhase("subtitle");
            await typeText("subtitle", content.subtitle);
            
            // Shorter pause before paragraph for faster sequence
            await sleep(100); // reduced delay
            
            // Paragraph just fades in (no typewriter effect)
            setTypingPhase("paragraph");
            // Paragraph is already set, just need to trigger the state change
            
            // Wait for paragraph fade transition to complete (faster now)
            await sleep(2500);
            setAnimationComplete(true);
            clearInterval(cursorBlinkInterval);
            setShowCursor(false);
        };
        
        // Function to type text with natural timing
        const typeText = (field, content) => {
            return new Promise(resolve => {
                let i = 0;
                // Variable typing speeds with original values for reference
                const randomDelays = [40, 60, 80, 100];
                
                const type = () => {
                    if (i <= content.length) {
                        setText(prev => ({
                            ...prev,
                            [field]: content.substring(0, i)
                        }));
                        i++;
                        
                        // Calculate typing delay - title at original speed, others faster
                        let delay;
                        if (field === "paragraph") {
                            // Fast for paragraph
                            delay = randomDelays[Math.floor(Math.random() * randomDelays.length)] * 0.15; // 0.5 / 3 for 3x speed
                        } else if (field === "title") {
                            // Double speed for title (half the original delay)
                            delay = randomDelays[Math.floor(Math.random() * randomDelays.length)] / 2;
                        } else {
                            // Fast for subtitle
                            delay = randomDelays[Math.floor(Math.random() * randomDelays.length)] / 3; // 3x faster
                        }
                        
                        // Add pause after punctuation (original for title, reduced for others)
                        if (i > 1 && ['.', ',', '!', '?', ':'].includes(content[i-2])) {
                            if (field === "title") {
                                delay += 75; // Reduced from 150 (double speed)
                            } else {
                                delay += 50; // Reduced pause for subtitle and paragraph
                            }
                        }
                        
                        typingTimer = setTimeout(type, delay);
                    } else {
                        resolve();
                    }
                };
                
                type();
            });
        };
        
        // Helper function for pauses
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        // Start the animation sequence when section becomes active
        if (isActive) {
            runTypewriterSequence();
        }
        
        // Clean up all timers when component unmounts or section becomes inactive
        return () => {
            clearInterval(cursorBlinkInterval);
            clearTimeout(typingTimer);
        };
    }, [isActive]);
    
    // Determine cursor style based on current typing phase
    const getCursorStyle = (phase) => {
        const baseCursorStyle = {
            display: "inline-block",
            width: "0.08em",
            height: "1em",
            marginLeft: "0.1em",
            background: "linear-gradient(90deg, #9C55FF, #6344F5, #B15DFF)",
            animation: typingPhase === "title" ? "blink 0.5s infinite" : "blink 0.4s infinite" // Faster for title, even faster for others
        };
        
        if (typingPhase === phase && showCursor) {
            return (
                <span 
                    className={phase === "title" ? "typewriter-cursor title-cursor-faster" : "typewriter-cursor fast-cursor"}
                    style={baseCursorStyle}
                ></span>
            );
        }
        return null;
    };
    
    // Define styles for the bio section to match hero section styling
    const styles = {
        section: {
            position: "relative",
            height: "100vh",
            maxHeight: "100vh",
            overflow: "hidden", 
            background: "transparent",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            perspective: "1000px", // Add 3D perspective for better scroll effect
        },
        contentContainer: {
            position: "relative",
            zIndex: 10,
            width: "100%",
            maxWidth: "1200px",
            textAlign: "center",
            padding: "3rem 1rem",
            background: "transparent"
        },
        logo: {
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) scale(0.8)",
            width: "clamp(200px, 40vw, 400px)",
            height: "auto",
            opacity: 0,  // Start hidden, we'll animate with JS
            zIndex: 1
        },
        title: {
            fontSize: "clamp(3rem, 8vw, 5.5rem)",
            marginBottom: "2.5rem",
            textAlign: "left",
            color: "transparent",
            background: "linear-gradient(90deg, #9C55FF, #6344F5, #B15DFF)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            textShadow: "0 0 1px rgba(0,0,0,0.1)",
            WebkitTextStroke: "0.5px rgba(156, 85, 255, 1)",
            fontWeight: "900",
            letterSpacing: "-0.02em",
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            position: "relative",
            zIndex: 5,
            animation: "fadeIn 1s ease-out",
            minHeight: "calc(3rem * 1.3)", // Reserve height for the title
            lineHeight: "1.2", // Match hero section line height
            padding: "0 0.5rem", // Match hero section padding
            boxShadow: "none",
            border: "none",
            display: "inline-block"
        },
        subtitle: {
            fontSize: "clamp(1.8rem, 4vw, 3rem)",
            marginBottom: "1.5rem",
            marginTop: "2rem",
            textAlign: "left",
            color: "#000000",
            fontWeight: "600",
            position: "relative",
            zIndex: 5,
            animation: "fadeIn 1s ease-out 0.5s forwards",
            opacity: 0
        },
        paragraph: {
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
            lineHeight: "1.6",
            maxWidth: "100%",
            margin: "2rem 0 0 0",
            color: "#555",
            textAlign: "left",
            position: "relative",
            zIndex: 5,
            willChange: "opacity, transform, visibility",
            opacity: 0,
            visibility: "hidden" // Start completely hidden
        },
        contentWrapper: {
            background: "transparent",
            borderRadius: "20px",
            maxWidth: "85%",
            margin: "2rem auto",
            padding: "3rem 2rem",
            position: "relative",
            willChange: "transform, opacity, filter", // Hardware acceleration for smoother transitions
            transformStyle: "preserve-3d", // Maintain 3D effect for children
            transformOrigin: "center center" // Center the transform origin for better 3D effects
        }
    };

    // Always render all content to maintain layout, even when not visible yet
    return (
        <section id="bio" style={styles.section}>
            {/* Background logo for depth */}
            <img 
                src={logo} 
                alt="Popular Consulting Logo Background" 
                style={styles.logo}
                className="bio-logo"
            />
            
            {/* Main content with typewriter effect */}
            <div 
                style={styles.contentWrapper} 
                ref={contentRef}
                className="bio-content"
            >
                <div style={styles.contentContainer}>
                    {/* Content wrapper with fixed height to prevent jumping */}
                    <div className="content-height-container">
                        {/* Title with typewriter effect */}
                        <h2 style={styles.title}>
                            <span className="typewriter-text hero-style">{text.title}</span>
                            {getCursorStyle("title")}
                            {/* Hidden but rendered version to reserve space */}
                            <span style={{
                                visibility: "hidden",
                                position: "absolute",
                                pointerEvents: "none",
                                height: 0,
                                overflow: "hidden"
                            }}>
                                Empower Your Workforce with AI
                            </span>
                        </h2>
                        
                        {/* Subtitle with typewriter effect */}
                        <h3 style={{
                            ...styles.subtitle, 
                            opacity: typingPhase !== "title" ? 1 : 0,
                            height: "auto",
                            minHeight: "calc(1.8rem * 1.2)"  // Reserve space based on font-size and line-height
                        }}>
                            <span className="typewriter-text">{text.subtitle}</span>
                            {getCursorStyle("subtitle")}
                        </h3>
                        
                        {/* Paragraph with fade-in effect */}
                        <p 
                            style={{
                                ...styles.paragraph, 
                                opacity: typingPhase === "paragraph" ? 1 : 0,
                                visibility: typingPhase === "paragraph" ? "visible" : "hidden",
                                transform: typingPhase === "paragraph" ? "translateY(0)" : "translateY(2px)",
                                transition: "opacity 2.5s ease, transform 2.5s ease, visibility 0s",
                                minHeight: "calc(1.5rem * 1.6 * 5)" // Reserve space for approximately 5 lines of text
                            }}
                        >
                            <span>{text.paragraph}</span>
                            {/* No cursor for paragraph since it's not typing */}
                        </p>
                    </div>
                </div>
            </div>
            
            {/* Animation styles */}
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    
                    .content-height-container {
                        position: relative;
                        width: 100%;
                        height: auto;
                        min-height: calc(3rem * 1.3 + 2.5rem + 1.8rem * 1.2 + 2rem + 1.5rem * 1.6 * 5);
                        /* Calculated from title height + margins + subtitle height + margins + paragraph height */
                        overflow: visible;
                    }
                    
                    /* Initial state for content when section loads */
                    .bio-content {
                        will-change: transform, opacity;
                        opacity: 0;
                        transform: translateY(80px);
                    }
                    
                    /* Logo state */
                    .bio-logo {
                        opacity: 0;
                        will-change: transform, opacity;
                    }
                    
                    /* Cursor animations */
                    @keyframes blink {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }
                    
                    /* Different cursor speeds based on phase */
                    .title-cursor {
                        animation: blink 0.7s infinite !important; /* original blinking speed */
                    }
                    
                    .title-cursor-faster {
                        animation: blink 0.5s infinite !important; /* faster blinking for double-speed title */
                    }
                    
                    .fast-cursor {
                        animation: blink 0.4s infinite !important; /* faster blinking */
                    }
                    
                    .typewriter-text {
                        display: inline-block;
                        overflow: visible;
                    }
                    
                    /* Match the hero's heavytext class */
                    .typewriter-text.hero-style {
                        font-weight: 900;
                        text-shadow: 0 0 1px rgba(255,255,255,0.2);
                        -webkit-text-stroke: 0.015em rgba(156, 85, 255, 0.5);
                        letter-spacing: -0.02em;
                    }
                    
                    /* Content scroll out animation */
                    @keyframes scrollOut {
                        0% {
                            transform: translateY(0) rotateX(0deg);
                            opacity: 1;
                            filter: blur(0px);
                        }
                        100% {
                            transform: translateY(-100vh) rotateX(-10deg);
                            opacity: 0;
                            filter: blur(8px);
                        }
                    }
                    
                    /* All transitions now handled in code */
                    
                    /* Media queries for responsive design */
                    @media screen and (max-width: 768px) {
                        .bio-content-wrapper {
                            padding: 2rem 1.5rem;
                            margin: 1.5rem;
                        }
                    }
                    
                    @media screen and (max-width: 480px) {
                        .bio-content-wrapper {
                            padding: 1.5rem 1rem;
                            margin: 1rem;
                        }
                    }
                `}
            </style>
        </section>
    );
};

export default BioSection;