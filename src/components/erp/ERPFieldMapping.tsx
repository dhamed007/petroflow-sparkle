import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Save } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ERPFieldMappingProps {
  integrationId: string;
  erpSystem: string;
}

export const ERPFieldMapping = ({ integrationId, erpSystem }: ERPFieldMappingProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [entities, setEntities] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any>({});
  const [selectedEntity, setSelectedEntity] = useState('orders');

  useEffect(() => {
    fetchEntities();
  }, [integrationId]);

  const fetchEntities = async () => {
    try {
      const { data, error } = await supabase
        .from('erp_entities')
        .select('*, erp_field_mappings(*)')
        .eq('integration_id', integrationId);

      if (error) throw error;
      setEntities(data || []);
      
      // Organize mappings by entity
      const mappingsByEntity: any = {};
      data?.forEach(entity => {
        mappingsByEntity[entity.entity_type] = entity.erp_field_mappings || [];
      });
      setMappings(mappingsByEntity);
    } catch (error: any) {
      toast({
        title: "Error loading mappings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateAIMappings = async (entityType: string) => {
    setGenerating(true);
    try {
      const entity = entities.find(e => e.entity_type === entityType);
      if (!entity) return;

      const petroflowFields = getPetroFlowFields(entityType);
      const erpFields = await fetchERPFields(entity.erp_entity_name);

      const { data, error } = await supabase.functions.invoke('erp-field-mapping-ai', {
        body: {
          entity_id: entity.id,
          petroflow_fields: petroflowFields,
          erp_fields: erpFields,
          erp_system: erpSystem,
        }
      });

      if (error) throw error;

      toast({ 
        title: "AI mappings generated!", 
        description: `Generated ${data.suggestions.length} field mappings`
      });
      
      fetchEntities();
    } catch (error: any) {
      toast({
        title: "AI generation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const getPetroFlowFields = (entityType: string) => {
    const fieldsByEntity: any = {
      orders: [
        { name: 'order_number', type: 'string' },
        { name: 'customer_id', type: 'uuid' },
        { name: 'product_type', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'delivery_address', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'created_at', type: 'timestamp' },
      ],
      customers: [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'phone', type: 'string' },
        { name: 'address', type: 'string' },
        { name: 'city', type: 'string' },
        { name: 'country', type: 'string' },
      ],
      invoices: [
        { name: 'invoice_number', type: 'string' },
        { name: 'order_id', type: 'uuid' },
        { name: 'amount', type: 'number' },
        { name: 'tax_amount', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'due_date', type: 'date' },
      ],
      payments: [
        { name: 'transaction_reference', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'paid_at', type: 'timestamp' },
      ],
    };
    return fieldsByEntity[entityType] || [];
  };

  const fetchERPFields = async (_entityName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('erp-field-mapping-ai', {
        body: { integration_id: integrationId, erp_system: erpSystem, action: 'get_schema' }
      });
      if (error) throw error;
      return data.fields ?? [];
    } catch (error: any) {
      toast({
        title: "Could not fetch ERP fields",
        description: error.message || "Falling back to empty schema",
        variant: "destructive",
      });
      return [];
    }
  };

  const updateMapping = (entityType: string, fieldIndex: number, updates: any) => {
    const entityMappings = [...(mappings[entityType] || [])];
    entityMappings[fieldIndex] = { ...entityMappings[fieldIndex], ...updates };
    setMappings({ ...mappings, [entityType]: entityMappings });
  };

  const saveMapping = async (entityType: string) => {
    try {
      const entity = entities.find(e => e.entity_type === entityType);
      if (!entity) return;

      const entityMappings = mappings[entityType] || [];
      
      for (const mapping of entityMappings) {
        await supabase.from('erp_field_mappings').upsert({
          ...mapping,
          entity_id: entity.id,
          manually_verified: true,
        });
      }

      toast({ title: "Mappings saved successfully!" });
      fetchEntities();
    } catch (error: any) {
      toast({
        title: "Error saving mappings",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading field mappings...</div>;
  }

  return (
    <Tabs value={selectedEntity} onValueChange={setSelectedEntity} className="space-y-6">
      <TabsList className="grid grid-cols-4 w-full">
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="customers">Customers</TabsTrigger>
        <TabsTrigger value="invoices">Invoices</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
      </TabsList>

      {['orders', 'customers', 'invoices', 'payments'].map(entityType => (
        <TabsContent key={entityType} value={entityType} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold capitalize">{entityType} Field Mapping</h3>
            <Button 
              onClick={() => generateAIMappings(entityType)}
              disabled={generating}
              variant="outline"
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? 'Generating...' : 'AI Suggest Mappings'}
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              {getPetroFlowFields(entityType).map((field, index) => {
                const mapping = mappings[entityType]?.[index] || {};
                return (
                  <div key={field.name} className="grid grid-cols-3 gap-4 items-center p-4 border rounded-lg">
                    <div>
                      <Label className="text-sm font-medium">{field.name}</Label>
                      <p className="text-xs text-muted-foreground">{field.type}</p>
                      {mapping.ai_suggested && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          AI: {(mapping.ai_confidence_score * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                    
                    <div>
                      <Label className="text-xs">ERP Field</Label>
                      <Input
                        value={mapping.erp_field || ''}
                        onChange={(e) => updateMapping(entityType, index, { 
                          petroflow_field: field.name,
                          erp_field: e.target.value 
                        })}
                        placeholder="Map to ERP field"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-xs">Transform</Label>
                      <Select 
                        value={mapping.transform_function || 'none'}
                        onValueChange={(value) => updateMapping(entityType, index, { 
                          transform_function: value === 'none' ? null : value 
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="uppercase">Uppercase</SelectItem>
                          <SelectItem value="lowercase">Lowercase</SelectItem>
                          <SelectItem value="format_date">Format Date</SelectItem>
                          <SelectItem value="currency_convert">Currency Convert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Button onClick={() => saveMapping(entityType)} className="w-full gap-2">
            <Save className="w-4 h-4" />
            Save {entityType.charAt(0).toUpperCase() + entityType.slice(1)} Mappings
          </Button>
        </TabsContent>
      ))}
    </Tabs>
  );
};