
-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'student');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Books
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT,
  category TEXT,
  description TEXT,
  cover_url TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1,
  available_copies INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Borrowings
CREATE TABLE public.borrowings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  borrowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  returned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'borrowed' -- borrowed | returned
);
ALTER TABLE public.borrowings ENABLE ROW LEVEL SECURITY;

-- Profile policies
CREATE POLICY "Profiles select own or admin" ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Profiles insert own" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles update own" ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

-- User_roles policies
CREATE POLICY "Roles select own or admin" ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Roles insert self student" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'student');
CREATE POLICY "Admin manage roles" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Books policies
CREATE POLICY "Books select all auth" ON public.books FOR SELECT TO authenticated USING (true);
CREATE POLICY "Books admin all" ON public.books FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Borrowings policies
CREATE POLICY "Borrowings select own or admin" ON public.borrowings FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Borrowings insert own" ON public.borrowings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Borrowings update own or admin" ON public.borrowings FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Borrowings admin delete" ON public.borrowings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers: maintain available_copies on borrow/return
CREATE OR REPLACE FUNCTION public.handle_borrowing_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.books SET available_copies = available_copies - 1
    WHERE id = NEW.book_id AND available_copies > 0;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'borrowed' AND NEW.status = 'returned' THEN
      UPDATE public.books SET available_copies = available_copies + 1 WHERE id = NEW.book_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER borrowings_update_copies
AFTER INSERT OR UPDATE ON public.borrowings
FOR EACH ROW EXECUTE FUNCTION public.handle_borrowing_change();

-- Seed books
INSERT INTO public.books (title, author, category, description, total_copies, available_copies) VALUES
('The Pragmatic Programmer','David Thomas','Programming','Classic guide for software craftsmen.',3,3),
('Clean Code','Robert C. Martin','Programming','A handbook of agile software craftsmanship.',2,2),
('Sapiens','Yuval Noah Harari','History','A brief history of humankind.',4,4),
('Atomic Habits','James Clear','Self-help','Tiny changes, remarkable results.',5,5),
('Deep Work','Cal Newport','Self-help','Rules for focused success in a distracted world.',2,2),
('Introduction to Algorithms','Cormen et al.','Computer Science','Comprehensive algorithms textbook.',2,2);
