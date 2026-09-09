import React, {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {ActivityScreen} from '../activity/ActivityScreen';
import {AddActionSheet} from '../add/AddActionSheet';
import {AddTransactionScreen} from '../add/AddTransactionScreen';
import {AddKind} from '../add/types';
import {HomeScreen} from '../home/HomeScreen';
import {NavBar, TabId} from '../NavBar/NavBar';
import {currencyByCode} from '../onboarding/constants';
import {OnboardingDraft} from '../onboarding/types';
import {ComingSoonScreen} from './ComingSoonScreen';

type MainTabsProps = {
  draft: OnboardingDraft;
};

export function MainTabs({draft}: MainTabsProps) {
  const [tab, setTab] = useState<TabId>('home');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind | null>(null);

  const currency = currencyByCode(draft.currency);

  const openComposer = useCallback((kind: AddKind) => {
    setSheetOpen(false);
    setAddKind(kind);
  }, []);

  let page = null;
  if (tab === 'home') {
    page = (
      <HomeScreen name={draft.name} currencySymbol={currency.symbol} />
    );
  } else if (tab === 'activity') {
    page = <ActivityScreen currencySymbol={currency.symbol} />;
  } else if (tab === 'insights') {
    page = <ComingSoonScreen title="Insights" />;
  } else {
    page = <ComingSoonScreen title="Ask" />;
  }

  return (
    <View style={styles.root} collapsable={false}>
      <View style={styles.stage} collapsable={false}>
        {page}
      </View>

      <NavBar
        activeTab={tab}
        onTabPress={setTab}
        onAddPress={() => setSheetOpen(true)}
      />

      <AddActionSheet
        visible={sheetOpen && addKind === null}
        onClose={() => setSheetOpen(false)}
        onSelect={openComposer}
      />

      <AddTransactionScreen
        visible={addKind !== null}
        initialKind={addKind ?? 'expense'}
        currencySymbol={currency.symbol}
        categoryIds={draft.categoryIds}
        onClose={() => setAddKind(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stage: {
    flex: 1,
  },
});
