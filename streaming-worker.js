const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pg = require('pg');
const Redis = require('redis');
const cron = require('node-cron');

// Configuration from environment variables
const dbUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const logDir = process.env.LOG_DIR || './logs';

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Database and Redis clients
const pgClient = new pg.Client({ connectionString: dbUrl });
const redisClient = Redis.createClient({ url: redisUrl });

// Connect to PostgreSQL and Redis
async function connectDatabases() {
  try {
    await pgClient.connect();
    console.log('Connected to PostgreSQL database');
    
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
}

// Stream processing
const activeStreams = new Map();

// Generate a unique log filename
function generateLogFilename(streamId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(logDir, `stream-${streamId}-${timestamp}.log`);
}

// Create an FFmpeg command for multistreaming
function createFFmpegCommand(videoPath, platforms) {
  const inputs = [`-re -i "${videoPath}"`];
  
  // Create output for each platform using the FFmpeg 'tee' muxer
  const outputs = platforms.map(platform => {
    if (platform.type === 'rtmp') {
      return `rtmp://${platform.server}/${platform.streamKey}`;
    } else if (platform.type === 'custom') {
      return platform.url;
    }
    return null;
  }).filter(Boolean);

  // Build the complex FFmpeg command with tee output
  if (outputs.length === 1) {
    // Single output case
    return `${inputs.join(' ')} -c:v copy -c:a aac -f flv "${outputs[0]}"`;
  } else if (outputs.length > 1) {
    // Multiple outputs with tee muxer
    const teeOutputs = outputs.map(output => `[f=flv]${output}`).join('|');
    return `${inputs.join(' ')} -c:v copy -c:a aac -f tee "${teeOutputs}"`;
  }
  
  throw new Error('No valid output platforms provided');
}

// Start a stream
async function startStream(streamId, videoPath, platforms) {
  try {
    // Generate a log file
    const logFilename = generateLogFilename(streamId);
    const logStream = fs.createWriteStream(logFilename, { flags: 'a' });
    
    // Build FFmpeg command
    const ffmpegCommand = createFFmpegCommand(videoPath, platforms);
    console.log(`Starting stream ${streamId} with command: ${ffmpegCommand}`);
    
    // Execute FFmpeg as a process
    const ffmpegProcess = spawn(ffmpegPath, ffmpegCommand.split(' ').slice(1), {
      shell: true,
    });
    
    // Setup logging
    ffmpegProcess.stdout.pipe(logStream);
    ffmpegProcess.stderr.pipe(logStream);
    
    // Track active stream
    activeStreams.set(streamId, {
      process: ffmpegProcess,
      logFilename,
      logStream,
      startTime: new Date(),
      platforms,
    });
    
    // Update stream status in database
    await pgClient.query(
      'UPDATE streams SET status = $1, started_at = $2, log_file = $3 WHERE id = $4',
      ['active', new Date(), logFilename, streamId]
    );
    
    // Handle process exit
    ffmpegProcess.on('exit', async (code) => {
      console.log(`Stream ${streamId} exited with code ${code}`);
      
      // Close the log stream
      logStream.end();
      
      // Update stream status in database
      const status = code === 0 ? 'completed' : 'failed';
      await pgClient.query(
        'UPDATE streams SET status = $1, ended_at = $2 WHERE id = $3',
        [status, new Date(), streamId]
      );
      
      // Cleanup
      activeStreams.delete(streamId);
    });
    
    return true;
  } catch (error) {
    console.error(`Error starting stream ${streamId}:`, error);
    
    // Update stream status in database
    await pgClient.query(
      'UPDATE streams SET status = $1, error = $2 WHERE id = $3',
      ['failed', error.message, streamId]
    );
    
    return false;
  }
}

// Stop a stream
async function stopStream(streamId) {
  if (activeStreams.has(streamId)) {
    const { process, logStream } = activeStreams.get(streamId);
    
    // Send SIGTERM to FFmpeg process
    process.kill('SIGTERM');
    
    // Close log stream
    logStream.end();
    
    // Update stream status
    await pgClient.query(
      'UPDATE streams SET status = $1, ended_at = $2 WHERE id = $3',
      ['stopped', new Date(), streamId]
    );
    
    activeStreams.delete(streamId);
    return true;
  }
  
  return false;
}

// Process scheduled streams
async function processScheduledStreams() {
  try {
    // Get current time
    const now = new Date();
    
    // Find scheduled streams that should start now
    const result = await pgClient.query(`
      SELECT s.id, s.title, s.video_path, s.status, u.plan_active,
             jsonb_agg(p.*) as platforms
      FROM streams s
      JOIN users u ON s.user_id = u.id
      JOIN stream_platforms p ON s.id = p.stream_id
      WHERE s.status = 'scheduled'
      AND s.scheduled_at <= $1
      AND u.plan_active = true
      GROUP BY s.id, u.plan_active
    `, [now]);
    
    // Process each stream
    for (const stream of result.rows) {
      console.log(`Processing scheduled stream ${stream.id}: ${stream.title}`);
      
      const videoPath = path.join(uploadDir, stream.video_path);
      
      // Verify file exists
      if (!fs.existsSync(videoPath)) {
        console.error(`Video file not found for stream ${stream.id}: ${videoPath}`);
        
        await pgClient.query(
          'UPDATE streams SET status = $1, error = $2 WHERE id = $3',
          ['failed', 'Video file not found', stream.id]
        );
        
        continue;
      }
      
      // Start the stream
      await startStream(stream.id, videoPath, stream.platforms);
    }
  } catch (error) {
    console.error('Error processing scheduled streams:', error);
  }
}

// Main function
async function main() {
  await connectDatabases();
  
  // Schedule cron job to check for scheduled streams every minute
  cron.schedule('* * * * *', processScheduledStreams);
  
  console.log('Streaming worker started');
  
  // Listen for Redis messages (for immediate stream actions)
  await redisClient.subscribe('stream:start', async (message) => {
    const data = JSON.parse(message);
    console.log(`Received start request for stream ${data.streamId}`);
    await startStream(data.streamId, data.videoPath, data.platforms);
  });
  
  await redisClient.subscribe('stream:stop', async (message) => {
    const data = JSON.parse(message);
    console.log(`Received stop request for stream ${data.streamId}`);
    await stopStream(data.streamId);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  
  // Stop all active streams
  for (const [streamId] of activeStreams) {
    await stopStream(streamId);
  }
  
  // Close database connections
  await pgClient.end();
  await redisClient.quit();
  
  process.exit(0);
});

// Start the worker
main().catch(error => {
  console.error('Worker error:', error);
  process.exit(1);
}); 