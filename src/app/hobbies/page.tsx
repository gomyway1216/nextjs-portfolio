import Link from 'next/link';
import { HobbyCard } from '@/components/hobby';
import { getPublicHobbiesCached } from '@/lib/hobbies/getHobbiesServer';
import type { HobbyCategory } from '@/types/hobby';

export const revalidate = 300;

export default async function HobbiesPage() {
  let categories: HobbyCategory[] = [];
  let serverError = false;
  try {
    categories = await getPublicHobbiesCached();
  } catch (err) {
    console.error('[hobbies] server-side fetch failed', err);
    serverError = true;
  }

  return (
    <div className="hobbies-page">
      <div className="hobbies-page__container">
        <header className="hobbies-page__header">
          <h1 className="hobbies-page__title">My Hobbies</h1>
          <p className="hobbies-page__subtitle">
            Explore my interests and passions
          </p>
          <Link href="/#tools" className="hobbies-page__back-home">
            Back to Home Tools
          </Link>
        </header>

        {serverError && (
          <div className="hobbies-page__error">
            <p>Failed to load hobbies. Please try again later.</p>
          </div>
        )}

        {!serverError && categories.length === 0 && (
          <div className="hobbies-page__empty">
            <p>No hobbies available yet.</p>
          </div>
        )}

        {categories.length > 0 && (
          <div className="hobbies-page__grid">
            {categories.map((hobby) => (
              <HobbyCard key={hobby.id} hobby={hobby} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
