import 'expo-dev-client';
import {registerRootComponent} from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also sets up the Expo runtime for a native build or Expo Go.
registerRootComponent(App);
