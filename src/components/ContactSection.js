import React from "react";
import {
  Container,
  TextField,
  Button,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { useThemeMode } from "../contexts/ThemeContext";
import twitterIcon from "../assets/icons/twitter.svg";
import instagramIcon from "../assets/icons/instagram.svg";
import logo from "../assets/icons/popcon_png.png";

const ContactSection = ({ isActive }) => {
  const { isDark } = useThemeMode();
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
          contentEl.style.transition =
            "transform 0.8s ease-out, opacity 0.8s ease-out";
          contentEl.style.transform = "translateY(0)";
          contentEl.style.opacity = "1";

          // ENTRY ANIMATION for footer - with a delay
          footerEl.style.transition =
            "transform 0.8s ease-out 0.2s, opacity 0.8s ease-out 0.2s";
          footerEl.style.transform = "translateY(0)";
          footerEl.style.opacity = "1";
        } else if (!scrollOutStarted) {
          console.log("ContactSection becoming inactive");
          // EXIT ANIMATION
          setScrollOutStarted(true);

          // Apply the exit animation to form
          contentEl.style.transition =
            "transform 0.8s cubic-bezier(0.2, 0.0, 0.15, 1), opacity 0.8s ease-out";
          contentEl.style.transform = "translateY(-100dvh)";
          contentEl.style.opacity = "0";

          // Apply exit animation to footer (slightly faster to disappear first)
          footerEl.style.transition =
            "transform 0.6s cubic-bezier(0.2, 0.0, 0.15, 1), opacity 0.6s ease-out";
          footerEl.style.transform = "translateY(100px)";
          footerEl.style.opacity = "0";
        }
      }, 10); // Small timeout to ensure DOM is ready
    };

    // Initialize the section
    initContactSection();
  }, [isActive, scrollOutStarted]);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const containerStyles = {
    backgroundColor: isDark ? "rgba(6,6,16,0.78)" : "rgba(255,255,255,0.20)",
    backdropFilter: "blur(20px) saturate(130%)",
    WebkitBackdropFilter: "blur(20px) saturate(130%)",
    borderRadius: "24px",
    p: 3, // Reduced padding (from 4)
    position: "relative",
    zIndex: 2,
    margin: "auto",
    marginTop: "0", // No top margin
    marginBottom: "1rem", // Reduced bottom margin
    width: "80%",
    maxWidth: "1200px",
    minWidth: isMobile ? "300px" : "500px",
    border: "1px solid rgba(255, 255, 255, 0.22)",
    boxShadow:
      "0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.30)",
    transition: "all 0.3s ease",
    "&:hover": {
      boxShadow:
        "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.35)",
      backgroundColor: isDark ? "rgba(4,4,12,0.88)" : "rgba(255,255,255,0.26)",
    },
    "&::before": {
      // Subtle inner highlight
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "1px",
      background:
        "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0))",
      zIndex: -1,
    },
  };

  const textFieldStyles = {
    marginBottom: "1rem", // Reduced from 1.5rem
    "& .MuiFilledInput-root": {
      backgroundColor: "rgba(255, 255, 255, 0.05) !important", // Glass effect for inputs
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      borderRadius: "12px",
      border: "1px solid rgba(255, 255, 255, 0.15)",
      boxShadow: "inset 0 1px 5px rgba(0, 0, 0, 0.05)",
      transition: "all 0.3s ease",
      overflow: "hidden",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1) !important",
        boxShadow: "inset 0 1px 5px rgba(0, 0, 0, 0.08)",
      },
      "&.Mui-focused": {
        backgroundColor: "rgba(255, 255, 255, 0.15) !important",
        boxShadow: "inset 0 1px 5px rgba(0, 0, 0, 0.1)",
        borderColor: "rgba(99, 68, 245, 0.3)", // Subtle highlight that matches theme
      },
      "&::before, &::after": {
        display: "none", // Remove Material UI default underlines
      },
      // Add shimmer effect on hover
      "&::before": {
        content: '""',
        position: "absolute",
        top: "-50%",
        left: "-50%",
        width: "200%",
        height: "200%",
        background:
          "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%)",
        transform: "rotate(30deg)",
        transition: "all 0.5s ease",
        opacity: 0,
        zIndex: 0,
      },
      "&:hover::before": {
        opacity: 1,
        left: "100%",
      },
    },
    "& .MuiFilledInput-input": {
      color: isDark ? "rgba(225,225,245,0.88)" : "rgba(20,20,30,0.88)",
      fontWeight: "500",
      padding: "16px 20px",
      zIndex: 1,
      position: "relative",
    },
    "& .MuiInputLabel-root": {
      color: isDark ? "rgba(225,225,245,0.55)" : "rgba(20,20,30,0.58)",
      fontWeight: "500",
      marginLeft: "8px",
      "&.Mui-focused": {
        color: "#6344F5",
      },
    },
  };

  const buttonStyles = {
    marginTop: "1rem", // Reduced from 2rem
    fontWeight: "bold",
    fontSize: "1rem", // Slightly smaller
    padding: "10px 24px", // Smaller padding
    background: "linear-gradient(to right, #6344F5, #9C55FF)",
    borderRadius: "12px",
    position: "relative",
    overflow: "hidden",
    boxShadow:
      "0 8px 20px rgba(99, 68, 245, 0.25), 0 2px 5px rgba(156, 85, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.3)",
    "&:hover": {
      background: "linear-gradient(to right, #7355F6, #A465FF)",
      boxShadow:
        "0 12px 25px rgba(108, 68, 245, 0.4), 0 4px 10px rgba(156, 85, 255, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.4)",
      transform: "translateY(-3px)",
    },
    "&:active": {
      transform: "translateY(-1px)",
      boxShadow:
        "0 5px 15px rgba(108, 68, 245, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)",
    },
    transition: "all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
    "&::before": {
      // Shimmer effect
      content: '""',
      position: "absolute",
      top: "-50%",
      left: "-50%",
      width: "200%",
      height: "200%",
      background:
        "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)",
      transform: "rotate(30deg)",
      transition: "all 0.8s ease",
      opacity: 0,
    },
    "&:hover::before": {
      opacity: 1,
      left: "100%",
    },
  };

  // Footer pill — mirrors the NavMenu pill shape/glass exactly
  const footerContainerStyle = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "0.75rem 0.75rem 0.75rem 1.6rem",
    background: isDark ? "rgba(6,6,16,0.82)" : "rgba(255, 255, 255, 0.09)",
    backdropFilter: "blur(32px) saturate(160%)",
    WebkitBackdropFilter: "blur(32px) saturate(160%)",
    border: "1px solid rgba(255, 255, 255, 0.22)",
    borderRadius: "100px",
    boxShadow:
      "0 4px 24px rgba(0, 0, 0, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.30)",
    transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
    opacity: 0,
    transform: "translateY(50px)",
  };

  return (
    <section
      id="contact"
      aria-label="Contact"
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Subtle glow effect behind the content */}
      <div
        style={{
          position: "absolute",
          width: "80%",
          height: "70%",
          background:
            "radial-gradient(circle, rgba(99, 68, 245, 0.03) 0%, rgba(156, 85, 255, 0.02) 40%, rgba(255, 255, 255, 0) 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      ></div>

      {/* Main flex container — form centred, footer pill pinned to bottom */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          maxWidth: "1200px",
          padding: "2rem",
          position: "relative",
        }}
      >
        {/* Contact Form Container */}
        <div
          ref={contentRef}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            maxWidth: isMobile ? "100%" : "800px",
            opacity: 0, // Initially hidden, will be animated in useEffect
            transform: "translateY(30px)", // Initially offset, will be animated in useEffect
            marginBottom: "1rem", // Less margin at bottom
            flex: "0 1 auto", // Don't grow, allow shrinking
          }}
        >
          <Container
            sx={{
              ...containerStyles,
              width: "100%",
              "&::after": {
                content: '""',
                position: "absolute",
                top: "-1px",
                left: "-1px",
                right: "-1px",
                bottom: "-1px",
                borderRadius: "25px",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(99, 68, 245, 0.05), rgba(156, 85, 255, 0.05), rgba(255,255,255,0.1))",
                zIndex: -1,
                opacity: 0.5,
                filter: "blur(2px)",
                transition: "opacity 0.3s ease",
              },
              "&:hover::after": {
                opacity: 0.7,
              },
            }}
            className="contact-form glass-card"
          >
            <Typography
              variant="h2"
              gutterBottom
              color={isDark ? "rgba(225,225,245,0.88)" : "#333"}
              sx={{
                textAlign: "center",
                fontWeight: "900",
                marginBottom: "1.5rem", // Reduced from 2.5rem
                fontSize: "clamp(2.5rem, 6vw, 4rem)", // Slightly smaller
                backgroundImage:
                  "linear-gradient(90deg, #9C55FF, #6344F5, #B15DFF)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                textFillColor: "transparent",
                letterSpacing: "-0.02em",
                textShadow: "0 2px 10px rgba(99, 68, 245, 0.1)",
                position: "relative",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: "-10px", // Reduced from -15px
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "80px",
                  height: "4px",
                  background:
                    "linear-gradient(to right, rgba(99, 68, 245, 0.3), rgba(156, 85, 255, 0.3))",
                  borderRadius: "2px",
                },
              }}
            >
              Let's Talk.
            </Typography>
            <form
              action="https://formspree.io/f/mrgvbgww"
              method="POST"
              aria-label="Contact form"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                position: "relative",
                zIndex: 2,
              }}
            >
              {/* Glass sparkle effects */}
              <div
                style={{
                  position: "absolute",
                  top: "10%",
                  left: "5%",
                  width: "30px",
                  height: "30px",
                  background:
                    "radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)",
                  borderRadius: "50%",
                  opacity: 0.4,
                  zIndex: 1,
                }}
              ></div>
              <div
                style={{
                  position: "absolute",
                  bottom: "20%",
                  right: "8%",
                  width: "20px",
                  height: "20px",
                  background:
                    "radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)",
                  borderRadius: "50%",
                  opacity: 0.3,
                  zIndex: 1,
                }}
              ></div>
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
                aria-label="Send message"
              >
                Send Message
              </Button>
            </form>
          </Container>
        </div>

        {/* Footer pill — pinned to bottom, centering via flex wrapper so
                      translateY animation in useEffect never clobbers translateX(-50%) */}
        <div
          style={{
            position: "absolute",
            bottom: "2rem",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            padding: "0 2.4rem",
          }}
        >
          <div
            ref={footerRef}
            style={{
              ...footerContainerStyle,
              pointerEvents: "auto",
            }}
          >
            {/* Copyright — left side, mirrors brand-name typography */}
            <span
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 300,
                fontStyle: "italic",
                fontSize: "1.1rem",
                color: isDark ? "rgba(225,225,245,0.72)" : "rgba(20,20,30,0.78)",
                letterSpacing: "0.025em",
                whiteSpace: "nowrap",
                paddingRight: "0.4rem",
              }}
            >
              Popular Consulting © {new Date().getFullYear()}
            </span>

            {/* Separator */}
            <div
              style={{
                width: 1,
                height: "1.8rem",
                background: isDark ? "rgba(255,255,255,0.12)" : "rgba(20,20,30,0.11)",
                margin: "0 1.4rem",
                flexShrink: 0,
              }}
            />

            {/* Logo — decorative, text already present */}
            <img
              src={logo}
              alt=""
              aria-hidden="true"
              style={{
                width: 26,
                height: "auto",
                opacity: 0.88,
                flexShrink: 0,
              }}
            />

            {/* Separator */}
            <div
              style={{
                width: 1,
                height: "1.8rem",
                background: isDark ? "rgba(255,255,255,0.12)" : "rgba(20,20,30,0.11)",
                margin: "0 1.4rem",
                flexShrink: 0,
              }}
            />

            {/* Social links — styled like nav-link pills */}
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.1rem" }}
            >
              {[
                {
                  href: "https://twitter.com/mstrbstrdd",
                  src: twitterIcon,
                  alt: "Twitter",
                  label: "Popular Consulting on Twitter — opens in new tab",
                },
                {
                  href: "https://instagram.com",
                  src: instagramIcon,
                  alt: "Instagram",
                  label: "Popular Consulting on Instagram — opens in new tab",
                },
              ].map(({ href, src, alt, label }) => (
                <a
                  key={alt}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0.55rem 1.1rem",
                    borderRadius: "100px",
                    transition: "background 0.22s ease",
                    textDecoration: "none",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.22)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 18,
                      opacity: 0.72,
                      filter: "brightness(0) saturate(100%) invert(25%) sepia(60%) saturate(2000%) hue-rotate(240deg) brightness(0.9)",
                      transition: "opacity 0.22s ease",
                      display: "block",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.opacity = 1;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.opacity = 0.72;
                    }}
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
        {/* end centering wrapper */}
      </div>
    </section>
  );
};

export default ContactSection;
