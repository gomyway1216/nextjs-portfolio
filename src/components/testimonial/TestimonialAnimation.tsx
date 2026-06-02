'use client';
import Image from 'next/image';
import React, { useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function SimpleSlider() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'start',
    slidesToScroll: 1,
  });

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const TestimonilContent = [
    {
      imageName: 'team-1',
      desc: `  Lorem Ipsum is simply dummy text of the printing and
      typesetting industry. Lorem Ipsum has been the industry's
      standard dummy text ever since the 1500s.`,
      reviewerName: 'Nancy Byers',
      designation: 'CEO at ib-themes',
      delayAnimation: '',
    },
    {
      imageName: 'team-2',
      desc: ` Lorem Ipsum is simply dummy text of the printing and
      typesetting industry. Lorem Ipsum has been the industry's
      standard dummy text ever since the 1500s.`,
      reviewerName: 'Jara Afsari',
      designation: 'CEO at ib-themes',
      delayAnimation: '200',
    },
    {
      imageName: 'team-4',
      desc: ` Lorem Ipsum is simply dummy text of the printing and
      typesetting industry. Lorem Ipsum has been the industry's
      standard dummy text ever since the 1500s.`,
      reviewerName: 'Janiaya kiaram',
      designation: 'Visual Designer',
      delayAnimation: '400',
    },
  ];

  return (
    <div className="testimonial-wrapper">
      <div className="embla" style={{ position: 'relative' }}>
        <div className="embla__viewport" ref={emblaRef}>
          <div className="embla__container" style={{ display: 'flex', gap: '30px' }}>
            {TestimonilContent.map((val, i) => (
              <div
                key={i}
                className="embla__slide"
                style={{ flex: '0 0 calc(50% - 15px)', minWidth: 0 }}
                data-aos="fade-up"

                data-aos-delay={val.delayAnimation}
              >
                <div className="testimonial-01 media">
                  <div className="avatar">
                    <Image
                      src={`/img/testimonial/${val.imageName}.jpg`}
                      alt="review comments"
                      width={80}
                      height={80}
                    />
                  </div>
                  <div className="media-body">
                    <p>{val.desc}</p>
                    <h6>{val.reviewerName}</h6>
                    <span>{val.designation}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          className="embla__prev"
          onClick={scrollPrev}
          type="button"
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.3)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <ChevronLeft style={{ color: 'white' }} />
        </button>
        <button
          className="embla__next"
          onClick={scrollNext}
          type="button"
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.3)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <ChevronRight style={{ color: 'white' }} />
        </button>
      </div>
    </div>
  );
}
