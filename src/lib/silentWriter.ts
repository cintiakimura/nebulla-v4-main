
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

/**
 * Silent writer utility for updating the Nebula Architecture Spec.md
 */
export async function writeToSpec(content: string) {
  try {
    const response = await fetch(withProjectQuery('/api/write-spec'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(withProjectBody({ content })),
    });
    return response.ok;
  } catch (error) {
    console.error('Silent Writer Error:', error);
    return false;
  }
}
