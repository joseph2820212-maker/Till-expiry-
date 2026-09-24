// Jest mock for react-native-pdf (native module — can't load under jest).
// Renders as a plain View; tests read screen source as text.
import React from 'react';
import { View } from 'react-native';

const Pdf = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<View>) =>
  React.createElement(View, { ref, ...props }));
Pdf.displayName = 'Pdf';

export default Pdf;
