'use client';

import Image from 'next/image';
import React, { useCallback, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './embla-carousel.scss';

interface SimpleCarouselProps {
  images: string[];
  thumbImage: string;
}

export default function SimpleCarousel({ images, thumbImage }: SimpleCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const allImages = [thumbImage, ...(images || [])].filter((image): image is string => Boolean(image));

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback((index: number) => {
    if (emblaApi) emblaApi.scrollTo(index);
  }, [emblaApi]);

  const [selectedIndex, setSelectedIndex] = React.useState(0);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
    };

    emblaApi.on('select', onSelect);
    onSelect();

    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (emblaApi) {
      emblaApi.scrollTo(0);
    }
  }, [thumbImage, emblaApi]);

  return (
    <div className="embla">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {allImages.map((image, index) => (
            <div className="embla__slide" key={index}>
              <Image
                className="embla__slide__img"
                src={image}
                alt={`Slide ${index + 1}`}
                width={900}
                height={600}
                unoptimized
              />
            </div>
          ))}
        </div>
      </div>

      <button
        className="embla__button embla__button--prev"
        onClick={scrollPrev}
        type="button"
        aria-label="Previous slide"
      >
        <ChevronLeft />
      </button>

      <button
        className="embla__button embla__button--next"
        onClick={scrollNext}
        type="button"
        aria-label="Next slide"
      >
        <ChevronRight />
      </button>

      <div className="embla__dots">
        {allImages.map((_, index) => (
          <button
            key={index}
            className={`embla__dot ${index === selectedIndex ? 'embla__dot--selected' : ''}`}
            type="button"
            onClick={() => scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
