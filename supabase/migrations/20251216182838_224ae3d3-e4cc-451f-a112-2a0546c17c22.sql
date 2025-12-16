-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'success', 'error'
  category TEXT NOT NULL DEFAULT 'general', -- 'order', 'delivery', 'inventory', 'system'
  entity_type TEXT, -- 'order', 'delivery', 'inventory'
  entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- System can insert notifications for tenant users
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (user_id = auth.uid());

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create function to notify users when order status changes
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Notify the order creator
  IF NEW.created_by IS NOT NULL AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_title := 'Order Status Updated';
    v_message := 'Order ' || NEW.order_number || ' status changed to ' || REPLACE(NEW.status, '_', ' ');
    
    INSERT INTO public.notifications (tenant_id, user_id, title, message, type, category, entity_type, entity_id)
    VALUES (NEW.tenant_id, NEW.created_by, v_title, v_message, 'info', 'order', 'order', NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for order status changes
CREATE TRIGGER on_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_status_change();

-- Create function to notify on delivery status changes
CREATE OR REPLACE FUNCTION public.notify_delivery_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_record RECORD;
  v_title TEXT;
  v_message TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get order info
    SELECT order_number, created_by INTO v_order_record
    FROM public.orders WHERE id = NEW.order_id;
    
    v_title := 'Delivery Status Updated';
    v_message := 'Delivery for order ' || v_order_record.order_number || ' is now ' || REPLACE(NEW.status, '_', ' ');
    
    -- Notify order creator
    IF v_order_record.created_by IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, type, category, entity_type, entity_id)
      VALUES (NEW.tenant_id, v_order_record.created_by, v_title, v_message, 'info', 'delivery', 'delivery', NEW.id);
    END IF;
    
    -- Notify driver if assigned
    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (tenant_id, user_id, title, message, type, category, entity_type, entity_id)
      VALUES (NEW.tenant_id, NEW.driver_id, v_title, v_message, 'info', 'delivery', 'delivery', NEW.id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for delivery status changes
CREATE TRIGGER on_delivery_status_change
  AFTER UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_delivery_status_change();

-- Create function to notify on low stock
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Check if stock is below threshold
  IF NEW.min_threshold IS NOT NULL AND NEW.quantity <= NEW.min_threshold THEN
    v_title := 'Low Stock Alert';
    v_message := NEW.product_type || ' at ' || NEW.location || ' is running low (' || NEW.quantity || ' ' || NEW.unit || ' remaining)';
    
    -- Notify all tenant admins
    FOR v_admin IN 
      SELECT user_id FROM public.user_roles 
      WHERE tenant_id = NEW.tenant_id 
      AND role IN ('tenant_admin', 'dispatch_officer')
    LOOP
      INSERT INTO public.notifications (tenant_id, user_id, title, message, type, category, entity_type, entity_id)
      VALUES (NEW.tenant_id, v_admin.user_id, v_title, v_message, 'warning', 'inventory', 'inventory', NEW.id);
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for low stock
CREATE TRIGGER on_low_stock
  AFTER UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_low_stock();