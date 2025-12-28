/**
 * Utility to add Jump Game as a project to Firestore
 * Requires Firebase auth token
 */

export async function addJumpGameProject(getAuthToken: () => Promise<string>) {
  try {
    const projectData = {
      title: 'Jump Game',
      date: new Date().toISOString(),
      description: `<p>A classic jump-and-dodge arcade game built with TypeScript and HTML5 Canvas.</p>
        <p>Jump Game is an interactive browser game where players control a blue circle that must jump over red square obstacles
        to survive and rack up points. The game features smooth 60 FPS gameplay, collision detection, sound effects,
        and high score tracking.</p>
        <h3>Key Features:</h3>
        <ul>
          <li>Built with TypeScript and React for type safety and modern development</li>
          <li>HTML5 Canvas rendering with custom-drawn shapes</li>
          <li>Real-time collision detection system</li>
          <li>High score persistence across sessions</li>
          <li>Interactive sound effects (jump, collision, scoring)</li>
          <li>Responsive game loop using requestAnimationFrame for 60 FPS</li>
          <li>Smooth death animation with rotation and scaling effects</li>
        </ul>
        <h3>Technical Highlights:</h3>
        <ul>
          <li>Custom game engine with physics simulation (gravity and acceleration)</li>
          <li>State management using React hooks (useRef, useState, useEffect)</li>
          <li>Event-driven architecture for keyboard input handling</li>
          <li>Canvas 2D API for shape rendering and animations</li>
          <li>Web Audio API for sound effect playback</li>
          <li>Clean component design following React best practices</li>
        </ul>`,
      client: 'Personal Project',
      industry: 'Gaming',
      thumbImage: null,
      images: [],
      urls: [
        {
          name: 'Play Game',
          link: '/games/jump-game',
          type: 'Website',
        },
      ],
      technologies: [
        { name: 'TypeScript', type: 'language' },
        { name: 'React', type: 'framework' },
        { name: 'HTML5 Canvas', type: 'framework' },
        { name: 'Tailwind CSS', type: 'framework' },
        { name: 'Next.js', type: 'framework' },
      ],
      categories: ['Game', 'Interactive'],
    };

    const token = await getAuthToken();
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(projectData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add project');
    }

    const result = await response.json();
    console.log('✅ Jump Game added to projects:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to add Jump Game project:', error);
    throw error;
  }
}
