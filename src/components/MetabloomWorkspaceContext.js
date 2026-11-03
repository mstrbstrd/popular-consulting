import React from 'react';

// Embedded OrbSection instances keep their research inline. Only the standalone
// Orb route supplies the controller that owns the shared workspace surface.
const MetabloomWorkspaceContext = React.createContext(null);

export default MetabloomWorkspaceContext;
