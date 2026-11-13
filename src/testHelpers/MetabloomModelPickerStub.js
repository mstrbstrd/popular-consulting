import React from 'react';

// Workspace tests isolate saved work and threads from the separate model API.
export default function MetabloomModelPickerStub({ onChange, onAvailability }) {
  React.useEffect(() => {
    onChange({ provider: 'openai', model: 'default' }); onAvailability(true);
  }, [onChange, onAvailability]);
  return null;
}
