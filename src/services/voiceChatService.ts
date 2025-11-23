// Voice Chat API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const getResponse = async (formData: FormData): Promise<Response> => {
  try {
    const response = await fetch(`${API_BASE_URL}/voice-chat`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('Error in getResponse:', error);
    throw error;
  }
};
