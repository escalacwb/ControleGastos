import React from 'react';
import {Modal,View,Text,FlatList} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {S,Button,Empty} from './ui';
import {money,formatDate,monthLabel} from '../lib/finance';

export function DNADetailModal({detail,onClose,rows}){
  if(!detail)return null;
  const name=(table,id,fallback)=>rows(table).find(r=>r.id===id)?.name||fallback;
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={S.modalOverlay}><SafeAreaView edges={['bottom']} style={[S.modal,{height:'90%'}]}>
      <View style={S.modalHeader}><Text style={[S.text,{flex:1,fontWeight:'700',fontSize:18}]}>{detail.area} · {monthLabel(detail.month)}</Text><Button secondary onPress={onClose}>Fechar</Button></View>
      <View style={{padding:18,gap:8}}>
        <Text style={S.muted}>{detail.basis==='cash'?'Saídas das contas · data do pagamento. Faturas mostram a parte de cada compra incluída no pagamento, descontando créditos.':'Compras e parcelas no cartão · data da compra ou parcela. Estornos reduzem o total.'}</Text>
        <Text style={S.text}>{detail.items.length} registros · total da barra</Text><Text style={S.value}>{money(detail.total)}</Text>
      </View>
      <FlatList data={detail.items} keyExtractor={t=>t.id} contentContainerStyle={{paddingHorizontal:18,paddingBottom:24}}
        ListEmptyComponent={<Empty title="Nenhum gasto neste mês" detail="Esta barra representa um mês sem gastos nesta área."/>}
        renderItem={({item:t})=><View style={{paddingVertical:14,gap:6,borderBottomWidth:1,borderColor:'#ddd'}}>
          <View style={S.row}><Text style={[S.text,{flex:1}]}>{t.description||'Sem descrição'}</Text><Text style={[S.text,t.contribution<0&&S.positive]}>{money(t.contribution)}</Text></View>
          <Text style={S.muted}>{formatDate(t.date)} · {name('categories',t.category_id,'Sem categoria')}</Text>
          <Text style={S.muted}>{t.credit_card_id?rows('credit_cards').find(c=>c.id===t.credit_card_id)?.bank_name||'Cartão':name('accounts',t.account_id,'Conta')}{t.allocated?' · pago pela conta '+name('accounts',t.account_id,'Conta'):''}</Text>
          {t.allocated&&<Text style={S.muted}>Compra{t.purchase_date?' de '+formatDate(t.purchase_date):''}: {money(t.original_amount)} · valor contabilizado neste pagamento acima</Text>}
        </View>}/>
    </SafeAreaView></View>
  </Modal>;
}
