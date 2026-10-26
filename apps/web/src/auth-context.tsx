import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
export type User = {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  role: 'USER' | 'OWNER';
};
const Context = createContext<{ user: User | null; loading: boolean }>({
  user: null,
  loading: true,
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/users/me'),
    retry: false,
    staleTime: 60000,
  });
  return (
    <Context.Provider value={{ user: data ?? null, loading: isPending }}>
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
