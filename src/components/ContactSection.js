import React from 'react';
import VideoSection from './VideoSection';
import contactVideo from '../assets/video/popcon_landingpage_vid.mp4';
import { Container, TextField, Button, Typography, useTheme, useMediaQuery } from '@mui/material';

const ContactSection = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const containerStyles = {
        backgroundColor: 'rgba(0, 0, 35, 0.5)',
        borderRadius: '20px',
        p: 4,
        position: 'relative',
        zIndex: 2,
        margin: 'auto',
        marginTop: '2rem',
        marginBottom: '4rem',
        width: '80%',
        maxWidth: '1200px',
        minWidth: isMobile ? '300px' : '500px', // Adjust minWidth for mobile devices
    };

    return (
        <VideoSection videoSource={contactVideo} sectionId="contact" className="contact">
            <Container sx={containerStyles}>
                <Typography variant="h2" gutterBottom color="common.white">
                    Contact
                </Typography>
                <form action="https://formspree.io/f/mrgvbgww" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <TextField
                        id="name"
                        label="Name"
                        variant="filled"
                        type="text"
                        name="name"
                        required
                        fullWidth
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
                    />
                    <TextField
                        id="email"
                        label="Email"
                        variant="filled"
                        type="email"
                        name="email"
                        required
                        fullWidth
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
                    />
                    <TextField
                        id="message"
                        label="Message"
                        variant="filled"
                        multiline
                        rows={4}
                        name="message"
                        required
                        fullWidth
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
                    />
                    <Button type="submit" variant="contained" color="secondary" size="large">
                        Submit
                    </Button>
                </form>
            </Container>
        </VideoSection>
    );
};

export default ContactSection;
