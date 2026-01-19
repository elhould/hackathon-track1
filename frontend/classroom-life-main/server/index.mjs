import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildSystemPrompt, getPersonality } from './studentPersonalities.mjs';
import * as conversationManager from './conversationManager.mjs';
import { buildTutorMessages, buildPredictionPrompt } from './tutorPrompts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Load student data from cache
const studentsDataPath = path.join(__dirname, '../../../api_cache/students');
let studentsData = { students: [] };

try {
  const rawData = fs.readFileSync(studentsDataPath, 'utf-8');
  studentsData = JSON.parse(rawData);
  console.log(`Loaded ${studentsData.students.length} students from cache`);
} catch (error) {
  console.error('Error loading students data:', error.message);
}

// Helper: Find student by ID
function findStudent(studentId) {
  return studentsData.students.find(s => s.id === studentId);
}

// Helper: Find topic for a student
function findTopic(studentId, topicId) {
  const student = findStudent(studentId);
  if (!student) return null;
  return student.topics.find(t => t.id === topicId);
}

// ============ API ENDPOINTS ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Local student simulation server running',
    studentsLoaded: studentsData.students.length
  });
});

// List all students
app.get('/api/students', (req, res) => {
  const students = studentsData.students.map(s => ({
    id: s.id,
    name: s.name,
    grade_level: s.grade_level
  }));
  res.json({ students });
});

// Get topics for a specific student
app.get('/api/students/:studentId/topics', (req, res) => {
  const { studentId } = req.params;
  const student = findStudent(studentId);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  res.json({ topics: student.topics });
});

// List all subjects (unique)
app.get('/api/subjects', (req, res) => {
  const subjectsMap = new Map();

  studentsData.students.forEach(student => {
    student.topics.forEach(topic => {
      if (!subjectsMap.has(topic.subject_id)) {
        subjectsMap.set(topic.subject_id, {
          id: topic.subject_id,
          name: topic.subject_name
        });
      }
    });
  });

  res.json({ subjects: Array.from(subjectsMap.values()) });
});

// List all topics
app.get('/api/topics', (req, res) => {
  const { subject_id } = req.query;
  const topicsMap = new Map();

  studentsData.students.forEach(student => {
    student.topics.forEach(topic => {
      if (!subject_id || topic.subject_id === subject_id) {
        if (!topicsMap.has(topic.id)) {
          topicsMap.set(topic.id, topic);
        }
      }
    });
  });

  res.json({ topics: Array.from(topicsMap.values()) });
});

// Start a new conversation
app.post('/api/interact/start', (req, res) => {
  const { student_id, topic_id } = req.body;

  if (!student_id || !topic_id) {
    return res.status(400).json({ error: 'student_id and topic_id are required' });
  }

  const student = findStudent(student_id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const topic = findTopic(student_id, topic_id);
  if (!topic) {
    return res.status(404).json({ error: 'Topic not found for this student' });
  }

  const conversation = conversationManager.createConversation(
    student_id,
    topic_id,
    student,
    topic
  );

  console.log(`Started conversation ${conversation.conversation_id} with ${student.name} on ${topic.name}`);

  res.json(conversation);
});

// Send a message and get student response
app.post('/api/interact', async (req, res) => {
  const { conversation_id, tutor_message } = req.body;

  if (!conversation_id || !tutor_message) {
    return res.status(400).json({ error: 'conversation_id and tutor_message are required' });
  }

  const conversation = conversationManager.getConversation(conversation_id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (conversation.isComplete) {
    return res.status(400).json({ error: 'Conversation is already complete' });
  }

  // Add tutor message to history
  conversationManager.addMessage(conversation_id, 'tutor', tutor_message);

  // Build system prompt for this student
  const systemPrompt = buildSystemPrompt(conversation.studentId, conversation.topic);
  if (!systemPrompt) {
    return res.status(500).json({ error: 'Failed to build system prompt' });
  }

  // Get conversation history for OpenAI
  const messageHistory = conversationManager.getOpenAIMessages(conversation_id);

  try {
    // Call OpenAI to generate student response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messageHistory
      ],
      max_tokens: 300,
      temperature: 0.8
    });

    const studentResponse = completion.choices[0].message.content;

    // Add student response to history
    const updatedConversation = conversationManager.addMessage(conversation_id, 'student', studentResponse);

    console.log(`Turn ${updatedConversation.turnNumber}/${updatedConversation.maxTurns} - ${conversation.student.name}: "${studentResponse.substring(0, 50)}..."`);

    // Check if we need to run LLM prediction (after 5 student responses)
    let estimatedLevel = null;
    let lockedPrediction = conversationManager.getLockedPrediction(conversation_id);

    if (lockedPrediction) {
      estimatedLevel = lockedPrediction.level;
      console.log(`[interact] Using existing prediction: Level ${estimatedLevel}`);
    } else {
      // Count student messages in the conversation
      const studentMessages = updatedConversation.messages.filter(m => m.role === 'student');
      console.log(`[interact] Student messages count: ${studentMessages.length}`);

      if (studentMessages.length >= 5) {
        // We have 5+ student responses - run the LLM judge
        console.log(`[interact] Running LLM judge for level prediction...`);

        try {
          const conversationMessages = updatedConversation.messages.map(m => ({
            role: m.role,
            content: m.content
          }));

          const predictionPrompt = buildPredictionPrompt(
            conversation.student,
            conversation.topic,
            conversationMessages
          );

          const predictionCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Return only valid JSON. No extra text.' },
              { role: 'user', content: predictionPrompt }
            ],
            max_tokens: 200,
            temperature: 0
          });

          const rawPrediction = predictionCompletion.choices[0].message.content;
          console.log(`[interact] Raw LLM prediction: ${rawPrediction}`);

          let level = 3;
          let rationale = '';

          try {
            const parsed = JSON.parse(rawPrediction);
            if (parsed.level && parsed.level >= 1 && parsed.level <= 5) {
              level = parsed.level;
            }
            rationale = parsed.rationale || '';
          } catch (parseError) {
            const match = rawPrediction.match(/[1-5]/);
            if (match) {
              level = parseInt(match[0]);
            }
          }

          conversationManager.setLockedPrediction(conversation_id, level, rationale);
          estimatedLevel = level;
          console.log(`[interact] Locked prediction: Level ${level} - ${rationale}`);
        } catch (predictionError) {
          console.error('[interact] LLM prediction failed:', predictionError.message);
          estimatedLevel = 3;
          conversationManager.setLockedPrediction(conversation_id, 3, 'Default (prediction failed)');
        }
      }
    }

    res.json({
      conversation_id,
      interaction_id: `int_${Date.now()}`,
      student_response: studentResponse,
      turn_number: updatedConversation.turnNumber,
      is_complete: updatedConversation.isComplete,
      estimated_level: estimatedLevel
    });

  } catch (error) {
    console.error('OpenAI API error:', error.message);
    res.status(500).json({
      error: 'Failed to generate student response',
      details: error.message
    });
  }
});

// Generate auto-tutor response
app.post('/api/tutor-response', async (req, res) => {
  const { conversation_id } = req.body;

  if (!conversation_id) {
    return res.status(400).json({ error: 'conversation_id is required' });
  }

  const conversation = conversationManager.getConversation(conversation_id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  // Calculate turn number (next turn after current messages)
  const turn = conversation.turnNumber + 1;
  const maxTurns = conversation.maxTurns;

  // Get conversation messages in the format expected by tutor prompts
  const conversationMessages = conversation.messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  // Build tutor messages for OpenAI
  const tutorMessages = buildTutorMessages(
    conversation.student,
    conversation.topic,
    conversationMessages,
    turn,
    maxTurns
  );

  try {
    // Call OpenAI to generate tutor response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: tutorMessages,
      max_tokens: 500,
      temperature: 0.7
    });

    const tutorResponse = completion.choices[0].message.content;
    const phase = turn <= 5 ? 'diagnostic' : 'tutoring';

    // Get or compute the estimated level
    // Note: We evaluate at turn 6 because that's when we have all 5 diagnostic student responses
    // (turn N tutor response is generated BEFORE receiving turn N student response)
    let estimatedLevel = null;
    const existingPrediction = conversationManager.getLockedPrediction(conversation_id);

    if (existingPrediction) {
      // Use the locked prediction
      estimatedLevel = existingPrediction.level;
      console.log(`Using existing prediction: Level ${estimatedLevel}`);
    } else if (turn >= 6) {
      // At turn 6+, we have all 5 diagnostic responses - run the LLM judge
      console.log(`Running LLM judge for level prediction at turn ${turn}...`);
      console.log(`Conversation messages count: ${conversationMessages.length}`);
      console.log(`Student messages: ${conversationMessages.filter(m => m.role === 'student').length}`);

      try {
        const predictionPrompt = buildPredictionPrompt(
          conversation.student,
          conversation.topic,
          conversationMessages
        );
        console.log(`Prediction prompt built, length: ${predictionPrompt.length}`);

        const predictionCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Return only valid JSON. No extra text.' },
            { role: 'user', content: predictionPrompt }
          ],
          max_tokens: 200,
          temperature: 0
        });

        const rawPrediction = predictionCompletion.choices[0].message.content;
        console.log(`Raw LLM prediction response: ${rawPrediction}`);

        let level = 3; // default
        let rationale = '';

        try {
          const parsed = JSON.parse(rawPrediction);
          if (parsed.level && parsed.level >= 1 && parsed.level <= 5) {
            level = parsed.level;
          }
          rationale = parsed.rationale || '';
        } catch (parseError) {
          console.warn('JSON parse failed, trying regex extraction:', parseError.message);
          // Try to extract a number from the response
          const match = rawPrediction.match(/[1-5]/);
          if (match) {
            level = parseInt(match[0]);
          }
        }

        // Lock the prediction
        conversationManager.setLockedPrediction(conversation_id, level, rationale);
        estimatedLevel = level;
        console.log(`Locked prediction: Level ${level} - ${rationale}`);
      } catch (predictionError) {
        console.error('LLM prediction failed:', predictionError.message);
        // Don't fail the whole endpoint - just leave estimatedLevel as null
        // Or set a default level
        estimatedLevel = 3; // Default to middle level on error
        conversationManager.setLockedPrediction(conversation_id, 3, 'Default (prediction failed)');
        console.log('Using default level 3 due to prediction error');
      }
    } else {
      console.log(`Turn ${turn}: Not yet at diagnostic completion (need turn >= 6)`);
    }
    // For turns 1-5, estimatedLevel stays null (not enough data yet)

    console.log(`Auto-tutor turn ${turn}/${maxTurns} (${phase}): "${tutorResponse.substring(0, 50)}..."`);

    res.json({
      tutor_response: tutorResponse,
      turn_number: turn,
      phase,
      estimated_level: estimatedLevel,
      is_last_turn: turn >= maxTurns
    });

  } catch (error) {
    console.error('OpenAI API error (tutor):', error.message);
    res.status(500).json({
      error: 'Failed to generate tutor response',
      details: error.message
    });
  }
});

// TTS Proxy endpoint for ElevenLabs
app.post('/api/tts', async (req, res) => {
  const { text, voiceId, stability, similarityBoost, style } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  const voice = voiceId || 'TX3LPaxmHKxFdv7VOQHJ'; // Default to Liam voice

  // Build voice settings - allow customization per character
  const voiceSettings = {
    stability: stability ?? 0.5,
    similarity_boost: similarityBoost ?? 0.75,
  };
  if (style !== undefined) {
    voiceSettings.style = style;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: voiceSettings
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      return res.status(response.status).json({ error: 'TTS request failed', details: errorText });
    }

    // Stream the audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked'
    });

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error('TTS error:', error.message);
    res.status(500).json({ error: 'TTS request failed', details: error.message });
  }
});

// Generate educational image using OpenAI image models
app.post('/api/generate-image', async (req, res) => {
  const { description, message, topic } = req.body;
  const promptSource = description || message;

  if (!promptSource) {
    return res.status(400).json({ error: 'description is required' });
  }

  try {
    // Build an educational image prompt
    const imagePrompt = `Educational illustration for teaching: ${promptSource}.
Topic: ${topic || 'General education'}.
Style: Clean, simple, educational diagram or illustration suitable for students.
Use clear labels, bright colors, and a white or light background.
Make it easy to understand at a glance.`;

    console.log('Generating image:', promptSource);

    const response = await openai.images.generate({
      model: 'gpt-image-1-mini',
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'auto',
    });

    const imageData = response.data?.[0];
    const imageUrl = imageData?.url
      || (imageData?.b64_json ? `data:image/png;base64,${imageData.b64_json}` : null);

    if (!imageUrl) {
      throw new Error('No image returned from API');
    }
    console.log('Image generated successfully');

    res.json({ imageUrl, description: promptSource });

  } catch (error) {
    console.error('Image generation error:', error.message);
    res.status(500).json({
      error: 'Failed to generate image',
      details: error.message
    });
  }
});

// Speech-to-text endpoint for ElevenLabs
app.post('/api/transcribe', express.raw({
  type: [
    'audio/webm',
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'application/octet-stream'
  ],
  limit: '15mb'
}), async (req, res) => {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'audio is required' });
  }

  const contentType = req.headers['content-type'] || 'audio/webm';
  const extension = contentType.includes('wav')
    ? 'wav'
    : contentType.includes('mpeg')
      ? 'mp3'
      : contentType.includes('mp4')
        ? 'mp4'
        : contentType.includes('ogg')
          ? 'ogg'
          : 'webm';

  try {
    const formData = new FormData();
    const audioBlob = new Blob([req.body], { type: contentType });
    formData.append('file', audioBlob, `recording.${extension}`);
    formData.append('model_id', 'scribe_v2');
    formData.append('tag_audio_events', 'false');
    formData.append('diarize', 'false');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs transcription error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Transcription failed', details: errorText });
    }

    const transcription = await response.json();
    res.json(transcription);
  } catch (error) {
    console.error('Transcription error:', error.message);
    res.status(500).json({
      error: 'Transcription failed',
      details: error.message
    });
  }
});

// Get conversation stats (debug endpoint)
app.get('/api/debug/conversations', (req, res) => {
  res.json(conversationManager.getStats());
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Student Simulation Server                                ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                  ║
║  Students loaded: ${studentsData.students.length}                                       ║
║                                                           ║
║  Endpoints:                                               ║
║  - GET  /api/health           Health check                ║
║  - GET  /api/students         List students               ║
║  - GET  /api/students/:id/topics  Get student topics      ║
║  - POST /api/interact/start   Start conversation          ║
║  - POST /api/interact         Send message                ║
║  - POST /api/tutor-response   Auto-tutor response         ║
║  - POST /api/tts              Text-to-speech              ║
║  - POST /api/transcribe       Speech-to-text              ║
║  - POST /api/generate-image   Educational image           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
