'use client';
import React from 'react';
import { useForm } from 'react-hook-form';
import { useContactMutations } from '@/hooks';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ContactProps {
  blogId?: string;
}

const Contact = ({ blogId }: ContactProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>();

  const { createContact, loading } = useContactMutations();

  const onSubmit = async (data: ContactFormData) => {
    try {
      await createContact({
        blogId: blogId,
        name: data.name,
        email: data.email,
        subject: data.subject,
        comment: data.comment,
      });
      console.log('Message submitted: ' + JSON.stringify(data));
      reset();
      toast.success('Message sent successfully!');
    } catch (error) {
      console.error('Error submitting message: ', error);
      toast.error('Failed to send message. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="row">
        <div className="col-md-6">
          <div className="form-group mb-3">
            <Input
              type="text"
              placeholder="Full name"
              {...register('name', { required: true })}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && errors.name.type === 'required' && (
              <span className="text-sm text-destructive mt-1">Name is required</span>
            )}
          </div>
        </div>

        <div className="col-md-6">
          <div className="form-group mb-3">
            <Input
              type="email"
              placeholder="Email address"
              {...register(
                'email',
                {
                  required: 'Email is Required',
                  pattern: {
                    value: /\S+@\S+\.\S+/,
                    message: 'Entered value does not match email format',
                  },
                }
              )}
              className={errors.email ? 'border-destructive' : ''}
            />
            {errors.email && (
              <span className="text-sm text-destructive mt-1">{errors.email.message as string}</span>
            )}
          </div>
        </div>

        <div className="col-12">
          <div className="form-group mb-3">
            <Input
              type="text"
              placeholder="Subject"
              {...register('subject', { required: true })}
              className={errors.subject ? 'border-destructive' : ''}
            />
            {errors.subject && (
              <span className="text-sm text-destructive mt-1">Subject is required.</span>
            )}
          </div>
        </div>

        <div className="col-12">
          <div className="form-group mb-3">
            <Textarea
              rows={4}
              placeholder="Type comment"
              {...register('comment', { required: true })}
              className={errors.comment ? 'border-destructive' : ''}
            />
            {errors.comment && (
              <span className="text-sm text-destructive mt-1">Comment is required.</span>
            )}
          </div>
        </div>

        <div className="col-12">
          <div className="btn-bar">
            <Button type="submit" variant="default" disabled={loading}>
              {loading ? 'Sending...' : 'Send Message'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  comment: string;
}

export default Contact;
