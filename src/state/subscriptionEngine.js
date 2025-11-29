// inventory would eventually come from backend or POS
import inventory from '../data/inventory'; // mock for now

export function createSubscriptionEngine(cart, setCart) {
  return {
    addItem({ name, frequency }) {
      const item = inventory.find(i =>
        i.name.toLowerCase().includes(name.toLowerCase())
      );

      if (!item) {
        return { error: `Item not found: ${name}` };
      }

      const entry = { ...item, frequency };
      setCart(prev => [...prev, entry]);

      return { success: true, item: entry };
    },

    removeItem(name) {
      setCart(prev =>
        prev.filter(i => !i.name.toLowerCase().includes(name.toLowerCase()))
      );
      return { success: true };
    },

    updateFrequency(name, frequency) {
      setCart(prev =>
        prev.map(i =>
          i.name.toLowerCase().includes(name.toLowerCase())
            ? { ...i, frequency }
            : i
        )
      );
      return { success: true };
    },

    getSummary() {
      return cart.map(c => `${c.name} - ${c.frequency}`);
    }
  };
}
