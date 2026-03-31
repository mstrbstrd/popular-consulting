import React from "react";
import { BackgroundBeams } from "./BackgroundBeams";
import logo from "../assets/icons/popcon_png.png";

export function BackgroundBeamsDemo() {
  // Simplified state management for typewriter
  const [text, setText] = React.useState({ line1: "", line2: "" });
  const [typingState, setTypingState] = React.useState("line1"); // "line1", "line2", "complete"
  const [showCursor, setShowCursor] = React.useState(true);

  React.useEffect(() => {
    // Text to display
    const words = {
      line1: "Popular",
      line2: "Consulting",
    };

    let cursorBlinkInterval;
    let typingTimer;

    // Handles the typewriter animation sequence
    const typeSequence = async () => {
      // Setup cursor blinking
      cursorBlinkInterval = setInterval(() => {
        setShowCursor((prev) => !prev);
      }, 500);

      // Type first line
      await typeText("line1", words.line1);

      // Pause between lines
      await sleep(500);

      // Type second line
      setTypingState("line2");
      await typeText("line2", words.line2);

      // Keep cursor for a moment after finishing
      await sleep(700);

      // Complete animation and clean up
      setTypingState("complete");
      clearInterval(cursorBlinkInterval);
      setShowCursor(false);
    };

    // Types a single line of text with a natural feel
    const typeText = (line, text) => {
      return new Promise((resolve) => {
        let i = 0;
        const randomDelays = [80, 100, 120, 140]; // Variable delays for more natural typing

        const type = () => {
          if (i <= text.length) {
            setText((prev) => ({
              ...prev,
              [line]: text.substring(0, i),
            }));
            i++;

            // Use variable typing speed for more natural feel
            const delay =
              randomDelays[Math.floor(Math.random() * randomDelays.length)];
            typingTimer = setTimeout(type, delay);
          } else {
            clearTimeout(typingTimer);
            resolve();
          }
        };

        type();
      });
    };

    // Helper function for pauses
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Start the animation
    typeSequence();

    // Cleanup all timers
    return () => {
      clearInterval(cursorBlinkInterval);
      clearTimeout(typingTimer);
    };
  }, []);

  const mainStyles = {
    section: {
      position: "relative",
      height: "100vh", // Exact viewport height
      maxHeight: "100vh", // Limit maximum height
      overflow: "hidden", // Keep all content within bounds
      background: "transparent", // Make sure it's transparent
      display: "flex", // Use flex for better centering
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh", // Always full viewport height
    },
    backgroundContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 0,
    },
    glassOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1, // Above background beams, below other content
      background:
        "linear-gradient(to bottom, rgba(255, 255, 255, 0.01), rgba(255, 255, 255, 0.005))", // Even more subtle gradient
      backdropFilter: "blur(2px) saturate(100%)",
      WebkitBackdropFilter: "blur(2px) saturate(100%)", // Safari support
      boxShadow: "none", // Remove inner glow
      border: "none", // Remove border
      pointerEvents: "none", // Let clicks pass through
    },
    contentContainer: {
      position: "relative",
      height: "100%" /* Full height of parent */,
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      paddingBottom: "2rem" /* Add extra padding at bottom */,
      zIndex: 10, // Higher than the BackgroundBeams z-index
      overflow: "visible", // Ensure descenders are not cut off
    },
    contentBox: {
      maxWidth: "1200px",
      width: "100%",
      textAlign: "center",
      padding: "3rem 1rem", // Smaller padding on mobile
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      background: "transparent",
      border: "none",
      boxShadow: "none",
    },
    headingContainer: {
      marginBottom: "1rem",
      animation: "fadeIn 1s ease-out",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
    },
    mainHeading: {
      fontSize: "clamp(3rem, 12vw, 8rem)", // Smaller on mobile, larger on desktop
      fontWeight: "900", // Already at maximum weight
      position: "relative",
      color: "transparent",
      display: "inline-block",
      lineHeight: "1.2", // Increased line height to avoid cutting off descenders
      textAlign: "center",
      padding: "0 0.5rem",
      paddingBottom: "0.2em", // Added bottom padding to prevent cutting off descenders
      marginBottom: "clamp(1.5rem, 5vw, 2.5rem)", // Responsive margin
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      letterSpacing: "-0.02em",
      background: "linear-gradient(90deg, #9C55FF, #6344F5, #B15DFF)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      zIndex: 20, // Higher than the logo
      minHeight: "clamp(9rem, 26vw, 19rem)", // Increased minimum height to accommodate descenders
      textShadow: "0 0 1px rgba(0,0,0,0.1)", // Slight text shadow for added weight
      WebkitTextStroke: "0.5px rgba(156, 85, 255, 1)", // Darker stroke for more visual weight on white
    },
    cursor: {
      display: "inline-block",
      width: "3px",
      height: "1em",
      backgroundColor: "#6344F5",
      animation: "blink 1s infinite",
      marginLeft: "4px",
      verticalAlign: "middle",
    },
    badge: {
      display: "inline-block",
      background: "linear-gradient(to right, #6344F5, #9C55FF)",
      borderRadius: "2rem",
      padding: "clamp(0.4rem, 1.5vw, 0.6rem) clamp(1.2rem, 3vw, 1.8rem)", // Responsive padding
      marginTop: "0.5rem",
      marginBottom: "clamp(1.5rem, 5vw, 2.5rem)", // Responsive margin
      boxShadow: "0 4px 15px rgba(156, 85, 255, 0.4)",
      animation: "float 3s ease-in-out infinite",
    },
    badgeText: {
      color: "white",
      fontWeight: "600",
      fontSize: "clamp(0.8rem, 2vw, 1.25rem)", // Responsive font size
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      whiteSpace: "nowrap", // Prevent text wrapping in badge
    },
    tagline: {
      color: "#333333",
      fontSize: "clamp(1.2rem, 3vw, 2.25rem)", // Responsive font size
      fontWeight: "500",
      textAlign: "center",
      maxWidth: "950px",
      margin: "0 auto clamp(1.5rem, 4vw, 3rem)", // Responsive margin
      lineHeight: "1.4",
      animation: "fadeIn 1.5s ease-out",
      padding: "0 0.5rem", // Add padding for small screens
    },
    subTagline: {
      color: "#555555",
      fontSize: "clamp(1rem, 2vw, 1.5rem)", // Responsive font size
      fontWeight: "400",
      textAlign: "center",
      maxWidth: "750px",
      margin: "0 auto clamp(2rem, 5vw, 3.5rem)", // Responsive margin
      lineHeight: "1.5",
      animation: "fadeIn 2s ease-out",
      padding: "0 0.5rem", // Add padding for small screens
    },
    buttonContainer: {
      display: "flex",
      justifyContent: "center",
      gap: "clamp(0.8rem, 2vw, 1.5rem)", // Responsive gap
      flexWrap: "wrap", // Wrap on small screens
      animation: "fadeIn 2.5s ease-out",
      width: "100%", // Full width on mobile
    },
    primaryButton: {
      display: "inline-block",
      padding: "clamp(0.8rem, 2vw, 1.25rem) clamp(1.5rem, 3vw, 2.5rem)", // Responsive padding
      background: "linear-gradient(to right, #6344F5, #9C55FF)",
      color: "white",
      borderRadius: "0.75rem",
      fontWeight: "600",
      fontSize: "clamp(1rem, 2vw, 1.35rem)", // Responsive font size
      textDecoration: "none",
      transition: "all 0.3s ease",
      boxShadow: "0 4px 15px rgba(156, 85, 255, 0.4)",
      border: "none",
      margin: "0.5rem 0", // Vertical margin for stacked buttons on mobile
    },
    secondaryButton: {
      display: "inline-block",
      padding: "clamp(0.8rem, 2vw, 1.25rem) clamp(1.5rem, 3vw, 2.5rem)", // Responsive padding
      backgroundColor: "transparent",
      color: "#333333",
      borderRadius: "0.75rem",
      fontWeight: "600",
      fontSize: "clamp(1rem, 2vw, 1.35rem)", // Responsive font size
      textDecoration: "none",
      transition: "all 0.3s ease",
      border: "2px solid #6344F5",
      margin: "0.5rem 0", // Vertical margin for stacked buttons on mobile
    },
    logoContainer: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      animation: "flip 6s ease-in-out infinite",
      display: "flex",
      justifyContent: "center",
      perspective: "1000px",
      zIndex: 5, // Between glass overlay (1) and content (10)
    },
    logo: {
      width: "clamp(200px, 50vw, 500px)", // Responsive width: smaller on mobile, larger on desktop
      height: "auto",
      transformStyle: "preserve-3d", // Maintains 3D effect
      opacity: 0.9, // Slightly transparent to blend with background
    },
  };

  // Media query styles for different device sizes
  React.useEffect(() => {
    // Add responsive styles
    const style = document.createElement("style");
    style.innerHTML = `
      /* iOS Safari height fix */
      @supports (-webkit-touch-callout: none) {
        .hero-section {
          height: -webkit-fill-available;
          min-height: 650px; /* Ensure minimum height on iOS */
        }
      }
      
      @media (max-width: 768px) {
        /* Position content higher in the viewport */
        .content-container {
          align-items: flex-start !important;
          padding-top: 14% !important;
        }
        
        /* Adjust logo position for mobile */
        .logo-container {
          top: 30% !important;
        }
        
        /* Stack buttons on mobile */
        .button-container {
          flex-direction: column;
          align-items: center;
          margin-top: 1.5rem !important;
        }
        
        /* Make buttons full width on mobile */
        .hero-button {
          width: 100%;
          max-width: 300px;
        }
        
        /* Increase spacing between elements on mobile */
        .hero-section h1 {
          margin-bottom: 1.5rem !important;
        }
        
        .hero-section .badge {
          margin-bottom: 2rem !important;
        }
        
        .hero-section .tagline {
          margin-bottom: 1.5rem !important;
          line-height: 1.3 !important;
        }
        
        .hero-section .subTagline {
          margin-bottom: 2rem !important;
          line-height: 1.4 !important;
        }
      }
      
      @media (max-width: 480px) {
        /* Position content even higher on small screens */
        .content-container {
          padding-top: 10% !important;
        }
        
        /* Further adjustments for very small screens */
        .logo-container {
          top: 26% !important;
        }
        
        .logo-container img {
          max-width: 180px !important;
        }
        
        /* Even more spacing for small phones */
        .hero-section .tagline {
          font-size: 1.1rem !important;
          margin-bottom: 1.2rem !important;
        }
        
        .hero-section .subTagline {
          font-size: 0.95rem !important;
          margin-bottom: 1.8rem !important;
        }
      }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="hero-section" style={mainStyles.section}>
      {/* Background container - removed BackgroundBeams to avoid duplication */}
      <div style={mainStyles.backgroundContainer}>
        {/* BackgroundBeams is now only in ParallaxBackground component */}
      </div>

      {/* We've removed the glass overlay from here since it's now in ParallaxBackground */}

      {/* Flipping Logo behind text but above background */}
      <div className="logo-container" style={mainStyles.logoContainer}>
        <img src={logo} alt="Popular Consulting Logo" style={mainStyles.logo} />
      </div>

      {/* Content overlay */}
      <div style={mainStyles.contentContainer} className="content-container">
        <div style={mainStyles.contentBox} className="hero-content">
          {/* Main Heading with gradient text and typewriter animation */}
          <div style={mainStyles.headingContainer}>
            <h1 style={mainStyles.mainHeading}>
              <div
                className="line-container"
                style={{ overflow: "visible", lineHeight: "1.2" }}
              >
                <span className="typewriter-text heavytext">{text.line1}</span>
                {typingState === "line1" && showCursor && (
                  <span
                    className="typewriter-cursor"
                    style={{
                      display: "inline-block",
                      width: "0.08em",
                      height: "1em",
                      marginLeft: "0.1em",
                      background:
                        "linear-gradient(90deg, #9C55FF, #6344F5, #B15DFF)",
                    }}
                  ></span>
                )}
              </div>
              <div
                className="line-container"
                style={{
                  overflow: "visible",
                  lineHeight: "1.3",
                  paddingBottom: "0.2em",
                }}
              >
                <span className="typewriter-text heavytext">{text.line2}</span>
                {typingState === "line2" && showCursor && (
                  <span
                    className="typewriter-cursor"
                    style={{
                      display: "inline-block",
                      width: "0.08em",
                      height: "1em",
                      marginLeft: "0.1em",
                      background:
                        "linear-gradient(90deg, #9C55FF, #6344F5, #B15DFF)",
                    }}
                  ></span>
                )}
              </div>
            </h1>
          </div>

          {/* Animated badge/accent text */}
          <div style={mainStyles.badge}>
            <span style={mainStyles.badgeText}>AI-Powered Solutions</span>
          </div>

          {/* Tagline with larger text */}
          <p style={mainStyles.tagline}>
            Empowering your business with AI training and digital literacy
            solutions.
          </p>

          {/* Subtag with slightly smaller text */}
          <p style={mainStyles.subTagline}>
            Personalized consulting to help you navigate the digital landscape
            with confidence.
          </p>

          {/* CTA buttons with hover effects */}
          <div className="button-container" style={mainStyles.buttonContainer}>
            <button
              onClick={() => {
                // Find "services" section and navigate to it using the section dots
                const sectionDots = document.querySelectorAll('.section-dot');
                // Services is at index 2 (0-based, after Hero and Bio)
                if (sectionDots && sectionDots[2]) {
                  sectionDots[2].click();
                }
              }}
              className="hero-button"
              style={mainStyles.primaryButton}
              onMouseOver={(e) => {
                e.target.style.transform = "translateY(-3px) scale(1.02)";
                e.target.style.boxShadow = "0 8px 25px rgba(156, 85, 255, 0.5)";
              }}
              onMouseOut={(e) => {
                e.target.style.transform = "translateY(0) scale(1)";
                e.target.style.boxShadow = "0 4px 15px rgba(156, 85, 255, 0.4)";
              }}
            >
              Explore Our Services
            </button>

            <button
              onClick={() => {
                // Find "contact" section and navigate to it using the section dots
                const sectionDots = document.querySelectorAll('.section-dot');
                // Contact is at index 3 (0-based, after Hero, Bio, and Services)
                if (sectionDots && sectionDots[3]) {
                  sectionDots[3].click();
                }
              }}
              className="hero-button"
              style={mainStyles.secondaryButton}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = "rgba(156, 85, 255, 0.05)";
                e.target.style.transform = "translateY(-3px)";
                e.target.style.borderColor = "#9C55FF";
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = "transparent";
                e.target.style.transform = "translateY(0)";
                e.target.style.borderColor = "#6344F5";
              }}
            >
              Contact Us
            </button>
          </div>

          {/* Animation keyframes */}
          <style>
            {`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
              }
              
              @keyframes float {
                0% { transform: translateY(-0.5rem); }
                50% { transform: translateY(-1rem); }
                100% { transform: translateY(-0.5rem); }
              }
              
              @keyframes flip {
                0% {
                  transform: translate(-50%, -50%) rotateY(0deg);
                }
                50% {
                  transform: translate(-50%, -50%) rotateY(180deg);
                }
                100% {
                  transform: translate(-50%, -50%) rotateY(360deg);
                }
              }
              
              @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
              }
              
              .typewriter-cursor {
                animation: blink 0.7s infinite;
              }
              
              .line-container {
                display: block;
                width: 100%;
                overflow: visible !important;
              }
              
              .typewriter-text {
                display: inline-block;
                overflow: visible;
              }
              
              .heavytext {
                font-weight: 900;
                text-shadow: 0 0 1px rgba(255,255,255,0.2);
                -webkit-text-stroke: 0.015em rgba(156, 85, 255, 0.5);
                letter-spacing: -0.02em;
              }
              
              .modern-glass {
                position: relative;
                overflow: hidden;
              }
              
              .modern-glass::before {
                content: "";
                position: absolute;
                top: -10px;
                left: -10px;
                right: -10px;
                bottom: -10px;
                background: linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%);
                pointer-events: none;
                z-index: 0;
              }
              
              /* Touch device optimization */
              @media (hover: none) {
                .hero-button {
                  /* Add tap highlight color for mobile */
                  -webkit-tap-highlight-color: rgba(156, 85, 255, 0.2);
                }
              }
            `}
          </style>
        </div>
      </div>
    </div>
  );
}
