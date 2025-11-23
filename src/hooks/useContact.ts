'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/contactService';
import type { Contact } from '@/services/contactService';

export interface CreateContactData {
  blogId?: string;
  name: string;
  email: string;
  subject: string;
  comment: string;
}

/**
 * Hook to fetch all contacts (requires authentication)
 */
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getContacts();
      setContacts(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch contacts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return { contacts, loading, error, refetch: fetchContacts };
}

/**
 * Hook for contact mutations
 */
export function useContactMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createContact = async (contact: CreateContactData) => {
    try {
      setLoading(true);
      setError(null);
      const id = await api.createContact(contact);
      return id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create contact');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    createContact,
    loading,
    error,
  };
}
