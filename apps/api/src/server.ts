import { app } from './app.js';
import { config } from '@flowforge/config';

const port = config.PORT || 4000;

app.listen(port, () => {
  console.log(`[FlowForge API] Server listening on port ${port} (env: ${config.NODE_ENV})`);
});
